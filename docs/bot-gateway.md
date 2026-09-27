# Bot gateway

HTTP Cloud Function for Gearshift axis bots. It reads finance and chief-of-staff Firestore collections, and it drafts finance writes until Abi commits them.

Project: `dashboard-bb237`. The deployed URL is printed by `firebase deploy`. It is:

`https://us-central1-dashboard-bb237.cloudfunctions.net/bot_gateway`

The function is `bot_gateway` in `functions/main.py` (Python 3.12, `us-central1`). `on_image_upload` is a separate Storage trigger and is not part of this API.

This gateway does not connect to banks or Plaid. It writes Firestore documents only.

## Auth

Send `Authorization: Bearer <credential>` on every call except a curl confirm that uses the approval secret alone.

Two credentials are accepted:

| Bearer value | Who | Reads | Propose finance write | Commit finance write |
| --- | --- | --- | --- | --- |
| Firebase ID token | Signed-in dashboard user (`currentUser.getIdToken()`) | yes | yes | yes |
| Bot service secret | Axis bot, from `BOT_API_KEYS` | yes | yes | no |

A Firebase ID token is a JWT (three dot-separated segments). The function verifies it with the Admin SDK (`auth.verify_id_token`). That is the same signed-in user `firestore.rules` already requires (`request.auth != null`). Any valid user in this Firebase project is accepted. This app is single-user.

A bot secret is an opaque string with no `.` in it. `BOT_API_KEYS` is a JSON map of bot id to secret, for example `{"finance":"...","ops":"..."}`. Bot ids match `^[a-z][a-z0-9_-]{0,40}$`. Each secret is at least 20 characters.

Commit is a second request. Neither credential can overwrite a finance document in one call.

Bots cannot commit. Commit requires either:

- the same `Authorization: Bearer <Firebase ID token>`, or
- header `X-Abi-Approval: <ABI_APPROVAL_SECRET>` (for curl, without minting an ID token).

Do not put `ABI_APPROVAL_SECRET` in a bot. It must be different from every bot secret.

App Check is initialized in `src/firebaseConfig.js` for client Firestore access. This function uses the Admin SDK, which bypasses Firestore rules and App Check. Bots are not the web app and cannot pass reCAPTCHA App Check, so the gateway does not require an App Check token. Client reads and writes from the dashboard still go through App Check and `firestore.rules`.

## Collections

### Finance (read and draft write)

Shapes match the FinancialPlanner managers and `BudgetForm`. Unknown fields are rejected. Do not send `createdAt`, `updatedAt`, `completedAt`, or `lastUpdated`; the app writes those as Firestore timestamps. String fields are trimmed. On `userBills`, if `budgeted` is set and `amount` is omitted, `amount` is set to `budgeted` (same as `BillsManager`).

`userDebts` (`DebtManager`, `seedData.js`)

| Field | Create | Notes |
| --- | --- | --- |
| `name` | required | non-empty string |
| `type` | required | `credit_card`, `loan`, `mortgage`, `other` |
| `balance` | required | number |
| `interestRate` | required | number (percent, same as the form) |
| `minimumPayment` | required | number |
| `loginUrl` | optional | string |
| `notes` | optional | string |

`userBills` (`BillsManager`)

| Field | Create | Notes |
| --- | --- | --- |
| `name` | required | non-empty string |
| `category` | required | `housing`, `debt_payment`, `subscription`, `insurance`, `utilities`, `other` |
| `budgeted` | required | number |
| `amount` | optional | number; defaults to `budgeted` |
| `actual` | optional | number or null |
| `frequency` | required | `monthly`, `annual`, `weekly` |
| `autopay` | optional | boolean |
| `dueDay` | optional | integer 1–31 or null |
| `loginUrl` | optional | string |

`userInvestments` (`InvestmentsManager`)

| Field | Create | Notes |
| --- | --- | --- |
| `name` | required | non-empty string |
| `type` | required | `savings`, `brokerage`, `retirement`, `ira`, `other` |
| `accountSuffix` | optional | string |
| `balance` | required | number |
| `monthlyContribution` | required | number |
| `expectedReturn` | required | number |
| `owner` | required | `Abi`, `Tiffany`, `Joint` |
| `loginUrl` | optional | string |

`userIncome` (`OverviewPanel`, `seedData.js`)

| Field | Create | Notes |
| --- | --- | --- |
| `name` | required | non-empty string |
| `frequency` | required | `monthly`, `annual`, `weekly` |
| `amount` | required | number |

`budgetLogs` (`BudgetForm`)

| Field | Create | Notes |
| --- | --- | --- |
| `type` | required | `budgetRoutine` |
| `checklistCompleted` | required | array of strings |
| `durationMinutes` | required | number |
| `netWorth` | optional | number or null |
| `bettermentBalance` | optional | number or null |
| `totalDebt` | optional | number or null |

Updates may send any subset of those fields. At least one field is required. Deletes take a `docId` and no `data`.

### CoS (read only)

| Collection | What it is |
| --- | --- |
| `new_weeklyPlans` | Weekly plan document. The id is the week id used by Weekly view. |
| `dailyMetrics` | Daily scores. The id is `YYYY-MM-DD`. |
| `projects` | Kanban projects |
| `kanbanCards` | Kanban cards |
| `amRoutineLogs` | Morning routine logs |
| `pmRoutineLogs` | Evening routine logs |
| `new_axes` | Axes |
| `new_goals` | Goals |
| `new_milestones` | Milestones |

`create`, `update`, and `delete` on these return **403** `collection_read_only` and do not open a confirmation. `get` and `list` return the stored documents as JSON. Firestore timestamps become ISO-8601 strings.

## Requests

`POST` JSON only. Other methods return **405**.

### capabilities

```json
{ "action": "capabilities" }
```

**200**

```json
{
  "ok": true,
  "action": "capabilities",
  "confirmTtlSeconds": 1800,
  "auth": ["firebase_id_token", "bot_service_secret"],
  "reads": ["capabilities", "get", "list"],
  "financeMutations": ["create", "delete", "update"],
  "financeMutationsRequire": "propose, then confirm with a Firebase ID token or X-Abi-Approval",
  "collections": {
    "finance": { "access": "read_write", "names": ["budgetLogs", "userBills", "userDebts", "userIncome", "userInvestments"] },
    "cos": { "access": "read", "names": ["amRoutineLogs", "dailyMetrics", "kanbanCards", "new_axes", "new_goals", "new_milestones", "new_weeklyPlans", "pmRoutineLogs", "projects"] }
  }
}
```

### get

```json
{ "action": "get", "collection": "userDebts", "docId": "abc" }
```

**200** `{ "ok": true, "action": "get", "collection": "userDebts", "id": "abc", "data": {} }`

**404** `{ "ok": false, "error": "not_found" }`

### list

```json
{ "action": "list", "collection": "dailyMetrics", "limit": 25 }
```

`limit` defaults to 25 and must be from 1 to 50. There is no `orderBy` (no extra index).

**200** `{ "ok": true, "action": "list", "collection": "dailyMetrics", "documents": [{ "id": "2026-09-27", "data": {} }] }`

### propose (create, update, delete)

Does not write the target document.

```json
{
  "action": "create",
  "collection": "userDebts",
  "docId": "gateway-smoke",
  "data": {
    "name": "GATEWAY SMOKE TEST",
    "type": "other",
    "balance": 0,
    "interestRate": 0,
    "minimumPayment": 0
  }
}
```

Omit `docId` to let Firestore assign one when the draft is committed. `update` and `delete` require `docId`. `delete` must not include `data`.

**202**

```json
{
  "ok": true,
  "status": "pending_approval",
  "confirmToken": "<token>",
  "expiresAt": "2026-09-27T12:30:00Z",
  "requestedBy": "finance",
  "preview": {
    "action": "create",
    "collection": "userDebts",
    "docId": "gateway-smoke",
    "data": { "name": "GATEWAY SMOKE TEST", "type": "other", "balance": 0, "interestRate": 0, "minimumPayment": 0 },
    "payloadHash": "<64 hex chars>"
  }
}
```

`requestedBy` is the bot id, or `user:<uid>` when the caller used an ID token. The draft expires in 30 minutes. The raw token is not stored; the confirmation document id is its SHA-256.

### confirm

```json
{
  "action": "confirm",
  "confirmToken": "<token from the proposal>",
  "payloadHash": "<preview.payloadHash>"
}
```

Header, one of:

```
Authorization: Bearer <Firebase ID token>
X-Abi-Approval: <ABI_APPROVAL_SECRET>
```

`payloadHash` must be the hash from the proposal you are approving. A different hash, a swapped token, or extra `data` on this request does not change the write. The stored draft is what gets written.

**200** `{ "ok": true, "status": "consumed", "action": "create", "collection": "userDebts", "docId": "gateway-smoke" }`

Repeating confirm returns **409** `confirmation_already_used`. An expired draft returns **410** `confirmation_expired`. A wrong hash returns **409** `confirmation_mismatch` and leaves the draft pending.

## Errors

`{ "ok": false, "error": "<code>", "detail": "<optional>" }`

| HTTP | code | When |
| --- | --- | --- |
| 401 | `unauthorized` | Missing or bad bearer, or bad approval secret |
| 401 | `approval_required` | Confirm from a bot (or with no bearer) and no approval header |
| 403 | `collection_not_allowed` | Collection is not on the allowlist |
| 403 | `collection_read_only` | Write to a CoS collection |
| 400 | `invalid_shape` / `invalid_field` | Finance payload does not match the manager shape |
| 400 | `action_not_supported` | `transfer`, `pay`, `trade`, `wire`, `send_money` |
| 404 | `not_found` | Update or delete of a missing document |
| 409 | `already_exists` | Create with a `docId` that already exists |
| 503 | `gateway_not_configured` | `BOT_API_KEYS` or `ABI_APPROVAL_SECRET` is missing or invalid |

## Secrets

Do not commit key files.

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Run that three times. Put two values in a local `bot-keys.json`:

```json
{"finance":"<first>","ops":"<second>"}
```

Put the third value alone in `abi-approval.txt`.

```bash
firebase functions:secrets:set BOT_API_KEYS --project dashboard-bb237 --data-file bot-keys.json
firebase functions:secrets:set ABI_APPROVAL_SECRET --project dashboard-bb237 --data-file abi-approval.txt
```

Give the bot keys to axis bots. Keep the approval secret for Abi's confirm calls. Interactive `firebase functions:secrets:set NAME --project dashboard-bb237` also works; it prompts for the value. Surrounding whitespace is ignored.

## Deploy

```bash
firebase deploy --only functions:bot_gateway,firestore:rules --project dashboard-bb237
```

That publishes this function and the rule that blocks client access to `botGatewayConfirmations`. Hosting is not republished. `on_image_upload` stays as already deployed. A full `firebase deploy --only functions --project dashboard-bb237` still includes it, because `functions/main.py` still defines it.

`firestore.rules` still require a signed-in user for every other document. The confirmation collection is denied to clients so a signed-in session cannot edit a pending draft. The Admin SDK bypasses those rules.

If Google returns 403 before any JSON body, public invoker was blocked. The function sets invoker to `public`. Fallback, using the service name from the deploy output if it differs:

```bash
gcloud run services add-iam-policy-binding bot-gateway \
  --region=us-central1 \
  --member=allUsers \
  --role=roles/run.invoker \
  --project=dashboard-bb237
```

The bearer check is still required. Public invoker only lets the request reach the function.

## Smoke test

These calls hit live `dashboard-bb237`. The last step deletes the smoke debt.

```bash
export GATEWAY_URL="https://us-central1-dashboard-bb237.cloudfunctions.net/bot_gateway"
export FINANCE_KEY="<finance bot key>"
export ABI_APPROVAL_SECRET="<approval secret>"
```

No key. Expect **401** `unauthorized`, or **503** `gateway_not_configured` if the secrets are not bound.

```bash
curl -sS -i -X POST "$GATEWAY_URL" \
  -H 'Content-Type: application/json' \
  -d '{"action":"capabilities"}'
```

Reads.

```bash
curl -sS -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $FINANCE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"capabilities"}'

curl -sS -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $FINANCE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"list","collection":"userDebts","limit":1}'

curl -sS -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $FINANCE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"get","collection":"new_weeklyPlans","docId":"2026-W39"}'
```

Propose a smoke debt. Expect **202** `pending_approval`. A following get of `gateway-smoke` stays **404** until confirm.

```bash
curl -sS -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $FINANCE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"create","collection":"userDebts","docId":"gateway-smoke","data":{"name":"GATEWAY SMOKE TEST","type":"other","balance":0,"interestRate":0,"minimumPayment":0}}'
```

Confirm without the approval header. Expect **401** `approval_required`.

```bash
export TOKEN="<confirmToken>"
export HASH="<preview.payloadHash>"

curl -sS -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $FINANCE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"confirm\",\"confirmToken\":\"$TOKEN\",\"payloadHash\":\"$HASH\"}"
```

Commit as Abi. Expect **200** `consumed`. Confirming again expects **409** `confirmation_already_used`.

```bash
curl -sS -X POST "$GATEWAY_URL" \
  -H "X-Abi-Approval: $ABI_APPROVAL_SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"confirm\",\"confirmToken\":\"$TOKEN\",\"payloadHash\":\"$HASH\"}"
```

Delete it the same way: propose `{"action":"delete","collection":"userDebts","docId":"gateway-smoke"}`, then confirm with the new token and hash.

A CoS write must fail before any draft is stored:

```bash
curl -sS -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $FINANCE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"update","collection":"dailyMetrics","docId":"2026-09-27","data":{"productivityScore":1}}'
```

Expect **403** `collection_read_only`.

To commit with a Firebase ID token instead of the approval secret, sign in as the dashboard user and send `Authorization: Bearer $(the getIdToken() value)` on the confirm request. Leave `X-Abi-Approval` off.

## Local tests

No Firebase credentials required.

```bash
cd functions
python3 -m pip install -r requirements.txt
python3 -m unittest test_bot_gateway.py
```
