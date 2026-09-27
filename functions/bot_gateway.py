"""Authenticated CRUD gateway for Gearshift axis bots.

Bots call the HTTP function ``bot_gateway`` with a bearer API key. Reads of
allowlisted Firestore collections run immediately. Creates, updates, and
deletes are stored as pending confirmations and do not touch the target
document until Abi confirms with that token, the proposal's ``payloadHash``,
and ``ABI_APPROVAL_SECRET``.

This module does not move money, place trades, or call any client API. It
writes the JSON object Abi approved, and nothing else.

Secrets (Firebase Secret Manager, never committed):

    firebase functions:secrets:set BOT_API_KEYS --project dashboard-bb237
    # {"finance":"<random>","ops":"<random>"}
    # bot ids: lowercase letter, then lowercase letters, digits, "_" or "-"
    # each key: at least 20 characters; surrounding whitespace is ignored

    firebase functions:secrets:set ABI_APPROVAL_SECRET --project dashboard-bb237
    # one random string, at least 20 characters, different from every bot key

Give bot keys to axis bots. Keep the approval secret off the bots; Abi sends
it only on ``action=confirm`` in the ``X-Abi-Approval`` header.

Local unit tests can pass the same values as plain strings. In Cloud
Functions they are bound with ``SecretParam`` and show up as environment
variables.
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import re
import secrets
from typing import Protocol

CONFIRMATION_COLLECTION = "botGatewayConfirmations"
CONFIRM_TTL_SECONDS = 30 * 60
DEFAULT_LIST_LIMIT = 25
MAX_LIST_LIMIT = 50
MAX_BODY_BYTES = 120_000
MAX_DEPTH = 8
MAX_FIELDS = 80
MAX_NODES = 500
MAX_LIST_ITEMS = 200
MAX_STRING_LENGTH = 20_000
MAX_SAFE_INTEGER = 2**53
MIN_SECRET_LENGTH = 20

# Collection names that the React app actually reads and writes.
# Finance: FinancialPlanner managers, OverviewPanel, BudgetForm.
FINANCE_COLLECTIONS = frozenset(
    {
        "userDebts",
        "userBills",
        "userInvestments",
        "userIncome",
        "budgetLogs",
    }
)
# Ops: axes/goals/tasks, daily habit metrics, axis check-ins, kanban.
OPS_COLLECTIONS = frozenset(
    {
        "new_axes",
        "new_goals",
        "new_milestones",
        "new_tasks",
        "dailyMetrics",
        "goalCheckins",
        "projects",
        "kanbanCards",
        "amRoutineLogs",
        "pmRoutineLogs",
    }
)
ALLOWED_COLLECTIONS = FINANCE_COLLECTIONS | OPS_COLLECTIONS

READ_ACTIONS = frozenset({"capabilities", "get", "list"})
MUTATING_ACTIONS = frozenset({"create", "update", "delete"})
# Explicit non-goals. These are not CRUD of the records above.
BLOCKED_ACTIONS = frozenset(
    {
        "transfer",
        "pay",
        "payment",
        "trade",
        "execute_trade",
        "wire",
        "send_money",
    }
)

_BOT_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,40}$")
_FIELD_FORBIDDEN_RE = re.compile(r"[./~*\[\]]")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{20,200}$")


class GatewayError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


class DocumentMissing(Exception):
    pass


class DocumentExists(Exception):
    pass


class GatewayStore(Protocol):
    def get_doc(self, collection: str, doc_id: str) -> dict | None: ...

    def list_docs(self, collection: str, limit: int) -> list[dict]: ...

    def put_confirmation(self, doc_id: str, record: dict) -> None: ...

    def consume_and_execute(self, doc_id: str, now: int, expected_hash: str) -> dict: ...


def handle_gateway(
    method: str,
    headers,
    raw_body: str,
    *,
    store: GatewayStore,
    bot_keys_raw: str | None,
    approval_secret: str | None,
    now: int,
) -> tuple[int, dict]:
    try:
        return _handle(
            method,
            headers,
            raw_body,
            store=store,
            bot_keys_raw=bot_keys_raw,
            approval_secret=approval_secret,
            now=now,
        )
    except GatewayError as err:
        return err.status, {"ok": False, "error": err.code}


def _handle(
    method: str,
    headers,
    raw_body: str,
    *,
    store: GatewayStore,
    bot_keys_raw: str | None,
    approval_secret: str | None,
    now: int,
) -> tuple[int, dict]:
    if (method or "").upper() != "POST":
        raise GatewayError(405, "method_not_allowed")

    raw_body = raw_body or ""
    if len(raw_body.encode("utf-8")) > MAX_BODY_BYTES:
        raise GatewayError(400, "body_too_large")

    body = _parse_body(raw_body)
    action = body.get("action")
    if not isinstance(action, str) or not action:
        raise GatewayError(400, "invalid_action")
    if action in BLOCKED_ACTIONS:
        raise GatewayError(400, "action_not_supported")

    keys = load_bot_keys(bot_keys_raw)
    approval = load_approval_secret(approval_secret, keys)
    bot_id = _authenticated_bot(headers, keys)

    if action == "confirm":
        return _confirm(body, headers, store=store, approval=approval, now=now)

    if keys is None:
        raise GatewayError(503, "gateway_not_configured")
    if bot_id is None:
        raise GatewayError(401, "unauthorized")

    if action == "capabilities":
        return 200, capabilities_payload()
    if action == "list":
        return _list(body, store)
    if action == "get":
        return _get(body, store)
    if action in MUTATING_ACTIONS:
        return _propose(action, body, store=store, bot_id=bot_id, now=now)

    raise GatewayError(400, "invalid_action")


def capabilities_payload() -> dict:
    return {
        "ok": True,
        "action": "capabilities",
        "confirmTtlSeconds": CONFIRM_TTL_SECONDS,
        "reads": sorted(READ_ACTIONS),
        "mutations": sorted(MUTATING_ACTIONS),
        "mutationsRequire": "confirm token plus X-Abi-Approval",
        "collections": {
            "finance": sorted(FINANCE_COLLECTIONS),
            "ops": sorted(OPS_COLLECTIONS),
        },
    }


def load_bot_keys(raw: str | None) -> dict[str, str] | None:
    """Return bot-id -> key, or None when the secret is missing or malformed."""
    if raw is None or not str(raw).strip():
        return None
    try:
        parsed = json.loads(str(raw).strip())
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or not parsed:
        return None
    keys: dict[str, str] = {}
    for bot_id, key in parsed.items():
        if not isinstance(bot_id, str) or _BOT_ID_RE.fullmatch(bot_id) is None:
            return None
        if not isinstance(key, str):
            return None
        key = key.strip()
        if len(key) < MIN_SECRET_LENGTH:
            return None
        keys[bot_id] = key
    if len(set(keys.values())) != len(keys):
        return None
    return keys


def load_approval_secret(raw: str | None, bot_keys: dict[str, str] | None) -> str | None:
    if raw is None:
        return None
    secret = str(raw).strip()
    if len(secret) < MIN_SECRET_LENGTH:
        return None
    if bot_keys and any(sealed_equal(secret, key) for key in bot_keys.values()):
        return None
    return secret


def sealed_equal(presented: str, expected: str) -> bool:
    """Compare two strings without leaking which one matched via an exception."""
    left = hashlib.sha256(presented.encode("utf-8")).digest()
    right = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(left, right)


def mutation_hash(action: str, collection: str, doc_id: str | None, data: dict | None) -> str:
    body = {
        "action": action,
        "collection": collection,
        "docId": doc_id,
        "data": data,
    }
    raw = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def assess_confirmation(record: dict, now: int) -> str:
    """Classify a stored confirmation. Does not look at the target document."""
    status = record.get("status")
    if status == "consumed":
        return "already_consumed"
    if status in {"expired", "rejected"}:
        return status
    if status != "pending":
        return "rejected"

    expires = _as_int(record.get("expiresAt"))
    if expires is None or now >= expires:
        return "expired"
    if record.get("collection") not in ALLOWED_COLLECTIONS:
        return "rejected"
    if record.get("action") not in MUTATING_ACTIONS:
        return "rejected"

    expected = record.get("payloadHash")
    actual = mutation_hash(
        record.get("action"),
        record.get("collection"),
        record.get("docId"),
        record.get("data"),
    )
    if not isinstance(expected, str) or not sealed_equal(expected, actual):
        return "hash_mismatch"
    return "ready"


def resolve_confirmation(
    record: dict,
    now: int,
    *,
    target_exists: bool | None,
    assigned_id: str | None,
) -> dict:
    """Decide what a confirmation may do.

    ``target_exists`` is None when the caller has not looked at a target yet.
    For a ready auto-id create, pass ``target_exists=False`` and the id the
    store just allocated in ``assigned_id``.
    """
    decision = assess_confirmation(record, now)
    if decision == "expired" and record.get("status") == "pending":
        return {"decision": "expired", "new_status": "expired"}
    if decision == "hash_mismatch" and record.get("status") == "pending":
        return {"decision": "hash_mismatch", "new_status": "rejected"}
    if decision != "ready":
        return {"decision": decision, "new_status": None}

    action = record["action"]
    doc_id = record.get("docId")
    data = record.get("data")

    if action == "create" and not doc_id:
        if not assigned_id:
            return {"decision": "rejected", "new_status": "rejected"}
        doc_id = assigned_id
        target_exists = False

    if target_exists is None:
        return {"decision": "rejected", "new_status": None}

    if action == "create":
        if target_exists:
            return {"decision": "already_exists", "new_status": None}
        return {
            "decision": "consumed",
            "new_status": "consumed",
            "write": "set",
            "docId": doc_id,
            "data": copy.deepcopy(data),
        }
    if action == "update":
        if not target_exists:
            return {"decision": "not_found", "new_status": None}
        return {
            "decision": "consumed",
            "new_status": "consumed",
            "write": "update",
            "docId": doc_id,
            "data": copy.deepcopy(data),
        }
    if action == "delete":
        if not target_exists:
            return {"decision": "not_found", "new_status": None}
        return {
            "decision": "consumed",
            "new_status": "consumed",
            "write": "delete",
            "docId": doc_id,
            "data": None,
        }
    return {"decision": "rejected", "new_status": "rejected"}


def confirmation_id_for_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class MemoryStore:
    """Single-threaded test double. Production commits the same plan in a Firestore transaction."""

    def __init__(self):
        self.docs: dict[tuple[str, str], dict] = {}

    def get_doc(self, collection: str, doc_id: str) -> dict | None:
        _require_allowed(collection)
        found = self.docs.get((collection, doc_id))
        return None if found is None else copy.deepcopy(found)

    def list_docs(self, collection: str, limit: int) -> list[dict]:
        _require_allowed(collection)
        rows = [
            {"id": doc_id, "data": copy.deepcopy(data)}
            for (name, doc_id), data in self.docs.items()
            if name == collection
        ]
        return rows[:limit]

    def put_confirmation(self, doc_id: str, record: dict) -> None:
        self.docs[(CONFIRMATION_COLLECTION, doc_id)] = copy.deepcopy(record)

    def confirmation(self, doc_id: str) -> dict | None:
        found = self.docs.get((CONFIRMATION_COLLECTION, doc_id))
        return None if found is None else copy.deepcopy(found)

    def consume_and_execute(self, doc_id: str, now: int, expected_hash: str) -> dict:
        key = (CONFIRMATION_COLLECTION, doc_id)
        record = self.docs.get(key)
        if record is None:
            return {"decision": "missing"}
        stored_hash = record.get("payloadHash")
        if not isinstance(stored_hash, str) or not sealed_equal(stored_hash, expected_hash):
            return {"decision": "mismatch"}

        preview = assess_confirmation(record, now)
        assigned_id = None
        target_exists = None
        if preview == "ready":
            collection = record["collection"]
            _require_allowed(collection)
            if record["action"] == "create" and not record.get("docId"):
                assigned_id = secrets.token_hex(10)
                target_exists = False
            else:
                target_id = record.get("docId")
                target_exists = (collection, target_id) in self.docs

        plan = resolve_confirmation(
            record,
            now,
            target_exists=target_exists,
            assigned_id=assigned_id,
        )
        new_status = plan.get("new_status")
        if new_status and new_status != "consumed":
            record["status"] = new_status
            return {"decision": plan["decision"]}

        if plan["decision"] != "consumed":
            return {"decision": plan["decision"]}

        collection = record["collection"]
        result_id = plan["docId"]
        target_key = (collection, result_id)
        if plan["write"] == "set":
            self.docs[target_key] = copy.deepcopy(plan["data"])
        elif plan["write"] == "update":
            current = self.docs[target_key]
            current.update(copy.deepcopy(plan["data"]))
        elif plan["write"] == "delete":
            del self.docs[target_key]
        else:
            record["status"] = "rejected"
            return {"decision": "rejected"}

        record["status"] = "consumed"
        record["consumedAt"] = now
        record["resultDocId"] = result_id
        return {
            "decision": "consumed",
            "docId": result_id,
            "action": record["action"],
            "collection": collection,
        }


def _confirm(body: dict, headers, *, store: GatewayStore, approval: str | None, now: int) -> tuple[int, dict]:
    if approval is None:
        raise GatewayError(503, "gateway_not_configured")
    presented = header_value(headers, "X-Abi-Approval")
    if not presented:
        raise GatewayError(401, "approval_required")
    if not sealed_equal(presented, approval):
        raise GatewayError(401, "unauthorized")

    token = body.get("confirmToken")
    if not isinstance(token, str) or _TOKEN_RE.fullmatch(token) is None:
        raise GatewayError(400, "invalid_confirm_token")
    expected_hash = body.get("payloadHash")
    if not isinstance(expected_hash, str) or len(expected_hash) != 64:
        raise GatewayError(400, "payload_hash_required")

    # The token selects the stored operation. payloadHash must be the hash from
    # that proposal, so approval is tied to the preview Abi reviewed. Other
    # fields on this request cannot replace the stored write.
    result = store.consume_and_execute(
        confirmation_id_for_token(token),
        now,
        expected_hash,
    )
    decision = result.get("decision")
    if decision == "consumed":
        return 200, {
            "ok": True,
            "status": "consumed",
            "action": result.get("action"),
            "collection": result.get("collection"),
            "docId": result.get("docId"),
        }
    errors = {
        "missing": (404, "confirmation_not_found"),
        "already_consumed": (409, "confirmation_already_used"),
        "expired": (410, "confirmation_expired"),
        "rejected": (409, "confirmation_rejected"),
        "hash_mismatch": (409, "confirmation_rejected"),
        "not_found": (404, "not_found"),
        "already_exists": (409, "already_exists"),
        "mismatch": (409, "confirmation_mismatch"),
    }
    status, code = errors.get(decision, (409, "confirmation_rejected"))
    raise GatewayError(status, code)


def _propose(action: str, body: dict, *, store: GatewayStore, bot_id: str, now: int) -> tuple[int, dict]:
    collection = _parse_collection(body)
    doc_id = _parse_doc_id(body, required=action != "create")
    if action == "delete":
        if "data" in body and body["data"] is not None:
            raise GatewayError(400, "data_not_allowed")
        data = None
    else:
        data = _parse_data(body)

    if action in {"update", "delete"}:
        if store.get_doc(collection, doc_id) is None:
            raise GatewayError(404, "not_found")
    if action == "create" and doc_id is not None and store.get_doc(collection, doc_id) is not None:
        raise GatewayError(409, "already_exists")

    payload_hash = mutation_hash(action, collection, doc_id, data)
    token = secrets.token_urlsafe(32)
    record = {
        "status": "pending",
        "action": action,
        "collection": collection,
        "docId": doc_id,
        "data": data,
        "payloadHash": payload_hash,
        "requestedBy": bot_id,
        "createdAt": now,
        "expiresAt": now + CONFIRM_TTL_SECONDS,
    }
    store.put_confirmation(confirmation_id_for_token(token), record)
    return 202, {
        "ok": True,
        "status": "pending_approval",
        "confirmToken": token,
        "expiresAt": _iso(record["expiresAt"]),
        "requestedBy": bot_id,
        "preview": {
            "action": action,
            "collection": collection,
            "docId": doc_id,
            "data": data,
            "payloadHash": payload_hash,
        },
    }


def _list(body: dict, store: GatewayStore) -> tuple[int, dict]:
    collection = _parse_collection(body)
    limit = _parse_limit(body)
    documents = store.list_docs(collection, limit)
    return 200, {"ok": True, "action": "list", "collection": collection, "documents": documents}


def _get(body: dict, store: GatewayStore) -> tuple[int, dict]:
    collection = _parse_collection(body)
    doc_id = _parse_doc_id(body, required=True)
    data = store.get_doc(collection, doc_id)
    if data is None:
        raise GatewayError(404, "not_found")
    return 200, {"ok": True, "action": "get", "collection": collection, "id": doc_id, "data": data}


def _parse_body(raw_body: str) -> dict:
    if not raw_body.strip():
        raise GatewayError(400, "invalid_json")
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        raise GatewayError(400, "invalid_json") from None
    if not isinstance(body, dict):
        raise GatewayError(400, "invalid_body")
    return body


def _authenticated_bot(headers, keys: dict[str, str] | None) -> str | None:
    presented = parse_bearer(header_value(headers, "Authorization"))
    if presented is None:
        return None
    if keys is None:
        raise GatewayError(503, "gateway_not_configured")
    bot_id = identify_bot(presented, keys)
    if bot_id is None:
        raise GatewayError(401, "unauthorized")
    return bot_id


def identify_bot(presented: str, keys: dict[str, str]) -> str | None:
    found = None
    for bot_id, key in keys.items():
        if sealed_equal(presented, key):
            found = bot_id
    return found


def parse_bearer(value: str | None) -> str | None:
    if not value:
        return None
    parts = value.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def header_value(headers, name: str) -> str | None:
    if headers is None:
        return None
    lowered = name.lower()
    try:
        pairs = list(headers.items())
    except Exception:
        pairs = []
    for key, value in pairs:
        if str(key).lower() == lowered and isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _parse_collection(body: dict) -> str:
    collection = body.get("collection")
    if not isinstance(collection, str) or collection not in ALLOWED_COLLECTIONS:
        raise GatewayError(403, "collection_not_allowed")
    return collection


def _require_allowed(collection: str) -> None:
    if collection not in ALLOWED_COLLECTIONS:
        raise GatewayError(403, "collection_not_allowed")


def _parse_doc_id(body: dict, *, required: bool) -> str | None:
    if "docId" not in body or body["docId"] is None:
        if required:
            raise GatewayError(400, "doc_id_required")
        return None
    doc_id = body["docId"]
    if not isinstance(doc_id, str) or not _valid_doc_id(doc_id):
        raise GatewayError(400, "invalid_doc_id")
    return doc_id


def _valid_doc_id(doc_id: str) -> bool:
    if not doc_id or doc_id.strip() != doc_id:
        return False
    if len(doc_id.encode("utf-8")) > 700:
        return False
    if doc_id in {".", ".."}:
        return False
    if "/" in doc_id or "\\" in doc_id:
        return False
    if any(ord(char) < 32 for char in doc_id):
        return False
    return True


def _parse_limit(body: dict) -> int:
    if "limit" not in body or body["limit"] is None:
        return DEFAULT_LIST_LIMIT
    limit = body["limit"]
    if isinstance(limit, bool) or not isinstance(limit, int):
        raise GatewayError(400, "invalid_limit")
    if limit < 1 or limit > MAX_LIST_LIMIT:
        raise GatewayError(400, "invalid_limit")
    return limit


def _parse_data(body: dict) -> dict:
    if "data" not in body or body["data"] is None:
        raise GatewayError(400, "data_required")
    data = body["data"]
    if not isinstance(data, dict) or not data:
        raise GatewayError(400, "data_required")
    _validate_data(data, depth=1, budget=[0])
    encoded = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > 100_000:
        raise GatewayError(400, "data_too_large")
    return copy.deepcopy(data)


def _validate_data(data: dict, *, depth: int, budget: list[int]) -> None:
    if depth > MAX_DEPTH:
        raise GatewayError(400, "data_too_deep")
    if len(data) > MAX_FIELDS:
        raise GatewayError(400, "too_many_fields")
    for key, value in data.items():
        _validate_field_name(key)
        _validate_value(value, depth=depth, budget=budget)


def _validate_field_name(key) -> None:
    if not isinstance(key, str) or not key or key.strip() != key:
        raise GatewayError(400, "invalid_field_name")
    if len(key) > 500 or key.startswith("__") or _FIELD_FORBIDDEN_RE.search(key):
        raise GatewayError(400, "invalid_field_name")


def _validate_value(value, *, depth: int, budget: list[int]) -> None:
    budget[0] += 1
    if budget[0] > MAX_NODES:
        raise GatewayError(400, "data_too_large")
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        if len(value) > MAX_STRING_LENGTH:
            raise GatewayError(400, "string_too_long")
        return
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INTEGER:
            raise GatewayError(400, "number_out_of_range")
        return
    if isinstance(value, float):
        if value != value or value in {float("inf"), float("-inf")}:
            raise GatewayError(400, "number_not_finite")
        return
    if isinstance(value, list):
        if len(value) > MAX_LIST_ITEMS:
            raise GatewayError(400, "list_too_long")
        for item in value:
            _validate_value(item, depth=depth + 1, budget=budget)
        return
    if isinstance(value, dict):
        _validate_data(value, depth=depth + 1, budget=budget)
        return
    raise GatewayError(400, "unsupported_value")


def _as_int(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _iso(timestamp: int) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
