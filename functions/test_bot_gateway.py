"""Unit tests for the bot gateway. No Firebase credentials required."""

from __future__ import annotations

import json
import pathlib
import unittest
from datetime import datetime, timezone

from bot_gateway import (
    CONFIRMATION_COLLECTION,
    MemoryStore,
    confirmation_id_for_token,
    handle_gateway,
)
from firestore_store import to_jsonable

BOT_KEYS = json.dumps(
    {
        "finance": "finance-bot-key-0123456789",
        "ops": "ops-bot-key-0123456789abcd",
    }
)
APPROVAL = "abi-approval-secret-0123456789"
NOW = 1_700_000_000


def confirm_body(proposed, **extra):
    body = {
        "action": "confirm",
        "confirmToken": proposed["confirmToken"],
        "payloadHash": proposed["preview"]["payloadHash"],
    }
    body.update(extra)
    return body


def call(store, body, *, headers=None, keys=BOT_KEYS, secret=APPROVAL, now=NOW, method="POST", verify=None):
    if headers is None:
        headers = {"Authorization": "Bearer finance-bot-key-0123456789"}
    raw = body if isinstance(body, str) else json.dumps(body)
    return handle_gateway(
        method,
        headers,
        raw,
        store=store,
        bot_keys_raw=keys,
        approval_secret=secret,
        now=now,
        verify_id_token=verify,
    )


class GatewayTests(unittest.TestCase):
    def test_rejects_missing_and_bad_credentials(self):
        store = MemoryStore()
        status, body = call(store, {"action": "capabilities"}, headers={})
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "unauthorized")

        status, body = call(
            store,
            {"action": "capabilities"},
            headers={"Authorization": "Bearer nope-not-a-real-key"},
        )
        self.assertEqual(status, 401)

        status, body = call(store, {"action": "capabilities"}, headers={}, keys="")
        self.assertEqual(status, 503)
        self.assertEqual(body["error"], "gateway_not_configured")

    def test_approval_secret_must_differ_from_bot_keys(self):
        store = MemoryStore()
        status, body = call(
            store,
            {"action": "confirm", "confirmToken": "a" * 32},
            headers={"X-Abi-Approval": "finance-bot-key-0123456789"},
            secret="finance-bot-key-0123456789",
        )
        self.assertEqual(status, 503)
        self.assertEqual(body["error"], "gateway_not_configured")

    def test_capabilities_lists_real_collections(self):
        status, body = call(MemoryStore(), {"action": "capabilities"})
        self.assertEqual(status, 200)
        self.assertEqual(
            body["collections"]["finance"]["names"],
            ["budgetLogs", "userBills", "userDebts", "userIncome", "userInvestments"],
        )
        self.assertEqual(body["collections"]["finance"]["access"], "read_write")
        self.assertEqual(body["collections"]["cos"]["access"], "read")
        for name in (
            "new_weeklyPlans",
            "new_axes",
            "new_goals",
            "new_milestones",
            "dailyMetrics",
            "kanbanCards",
            "projects",
            "amRoutineLogs",
            "pmRoutineLogs",
        ):
            self.assertIn(name, body["collections"]["cos"]["names"])
        self.assertNotIn("new_tasks", body["collections"]["cos"]["names"])
        self.assertNotIn("advisorPrivate", json.dumps(body))
        self.assertNotIn(CONFIRMATION_COLLECTION, json.dumps(body["collections"]))

    def test_blocks_money_movement_and_unknown_collections(self):
        store = MemoryStore()
        status, body = call(store, {"action": "trade", "collection": "userDebts"})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "action_not_supported")

        status, body = call(store, {"action": "list", "collection": "journalEntries"})
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "collection_not_allowed")

        status, body = call(store, {"action": "get", "collection": CONFIRMATION_COLLECTION, "docId": "abc"})
        self.assertEqual(status, 403)

    def test_get_and_list(self):
        store = MemoryStore()
        store.docs[("userDebts", "wf")] = {"name": "Wells Fargo", "balance": 10}
        store.docs[("userDebts", "usaa")] = {"name": "USAA", "balance": 2}
        store.docs[("journalEntries", "secret")] = {"raw": "nope"}

        status, body = call(store, {"action": "get", "collection": "userDebts", "docId": "wf"})
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["balance"], 10)

        status, body = call(store, {"action": "get", "collection": "userDebts", "docId": "missing"})
        self.assertEqual(status, 404)

        status, body = call(store, {"action": "list", "collection": "userDebts", "limit": 1})
        self.assertEqual(status, 200)
        self.assertEqual(len(body["documents"]), 1)

        status, body = call(store, {"action": "list", "collection": "userDebts", "limit": 99})
        self.assertEqual(status, 400)

        status, body = call(
            store,
            {"action": "get", "collection": "dailyMetrics", "docId": "2026-09-27"},
        )
        self.assertEqual(status, 404)

        status, body = call(store, {"action": "get", "collection": "userDebts", "docId": "a/b"})
        self.assertEqual(status, 400)

    def test_mutation_stays_pending_until_abi_confirms(self):
        store = MemoryStore()
        status, proposed = call(
            store,
            {
                "action": "create",
                "collection": "userDebts",
                "docId": "smoke",
                "data": {
                    "name": "GATEWAY SMOKE TEST",
                    "type": "other",
                    "balance": 0,
                    "interestRate": 0,
                    "minimumPayment": 0,
                },
            },
        )
        self.assertEqual(status, 202)
        self.assertEqual(proposed["status"], "pending_approval")
        self.assertNotIn(("userDebts", "smoke"), store.docs)
        token = proposed["confirmToken"]
        conf_id = confirmation_id_for_token(token)
        self.assertNotEqual(conf_id, token)
        stored = store.confirmation(conf_id)
        self.assertEqual(stored["status"], "pending")
        self.assertNotIn(token, json.dumps(stored))

        status, body = call(
            store,
            confirm_body(proposed, data={"balance": 999999}),
            headers={"Authorization": "Bearer finance-bot-key-0123456789"},
        )
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "approval_required")
        self.assertNotIn(("userDebts", "smoke"), store.docs)

        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": "wrong-approval-secret-xxxx"},
        )
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "unauthorized")
        self.assertNotIn(("userDebts", "smoke"), store.docs)

        status, body = call(
            store,
            confirm_body(proposed, payloadHash="0" * 64, data={"balance": 999999}),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "confirmation_mismatch")
        self.assertNotIn(("userDebts", "smoke"), store.docs)
        self.assertEqual(store.confirmation(conf_id)["status"], "pending")

        status, body = call(
            store,
            confirm_body(proposed, collection="userInvestments", data={"balance": 999999}),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "consumed")
        self.assertEqual(body["docId"], "smoke")
        self.assertEqual(store.docs[("userDebts", "smoke")]["balance"], 0)
        self.assertEqual(store.docs[("userDebts", "smoke")]["name"], "GATEWAY SMOKE TEST")
        self.assertNotIn(("userInvestments", "smoke"), store.docs)

        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "confirmation_already_used")
        self.assertEqual(store.docs[("userDebts", "smoke")]["balance"], 0)

    def test_auto_id_create_returns_new_doc(self):
        store = MemoryStore()
        status, proposed = call(
            store,
            {
                "action": "create",
                "collection": "budgetLogs",
                "data": {
                    "type": "budgetRoutine",
                    "checklistCompleted": ["Pay/Schedule upcoming bills"],
                    "durationMinutes": 12,
                    "netWorth": None,
                },
            },
        )
        self.assertEqual(status, 202)
        self.assertIsNone(proposed["preview"]["docId"])
        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 200)
        doc_id = body["docId"]
        self.assertTrue(doc_id)
        self.assertEqual(store.docs[("budgetLogs", doc_id)]["durationMinutes"], 12)
        self.assertIsNone(store.docs[("budgetLogs", doc_id)]["netWorth"])

    def test_expired_token_does_not_write(self):
        store = MemoryStore()
        status, proposed = call(
            store,
            {
                "action": "create",
                "collection": "userIncome",
                "data": {"name": "Side Projects", "frequency": "monthly", "amount": 0},
            },
        )
        self.assertEqual(status, 202)
        token = proposed["confirmToken"]
        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
            now=NOW + 1800,
        )
        self.assertEqual(status, 410)
        self.assertEqual(body["error"], "confirmation_expired")
        self.assertFalse(any(name == "userIncome" for name, _doc in store.docs))

    def test_update_and_delete_round_trip(self):
        store = MemoryStore()
        store.docs[("userBills", "rent")] = {"name": "Housing/Rent", "budgeted": 3300, "actual": 3300}
        status, proposed = call(
            store,
            {
                "action": "update",
                "collection": "userBills",
                "docId": "rent",
                "data": {"actual": 3000},
            },
        )
        self.assertEqual(status, 202)
        self.assertEqual(store.docs[("userBills", "rent")]["actual"], 3300)

        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": "  " + APPROVAL + "\n"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(store.docs[("userBills", "rent")]["actual"], 3000)
        self.assertEqual(store.docs[("userBills", "rent")]["budgeted"], 3300)

        status, proposed = call(
            store,
            {"action": "delete", "collection": "userBills", "docId": "rent"},
        )
        self.assertEqual(status, 202)
        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 200)
        self.assertNotIn(("userBills", "rent"), store.docs)

    def test_update_of_missing_doc_does_not_open_a_confirmation(self):
        store = MemoryStore()
        status, body = call(
            store,
            {"action": "update", "collection": "userIncome", "docId": "missing", "data": {"amount": 1}},
        )
        self.assertEqual(status, 404)
        self.assertFalse(any(name == CONFIRMATION_COLLECTION for name, _doc in store.docs))

    def test_confirm_not_found_leaves_token_pending(self):
        store = MemoryStore()
        store.docs[("userDebts", "debt-1")] = {
            "name": "Card",
            "type": "credit_card",
            "balance": 10,
            "interestRate": 0,
            "minimumPayment": 1,
        }
        status, proposed = call(
            store,
            {
                "action": "update",
                "collection": "userDebts",
                "docId": "debt-1",
                "data": {"balance": 11},
            },
            headers={"Authorization": "Bearer ops-bot-key-0123456789abcd"},
        )
        self.assertEqual(status, 202)
        del store.docs[("userDebts", "debt-1")]
        token = proposed["confirmToken"]
        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 404)
        self.assertEqual(body["error"], "not_found")
        stored = store.confirmation(confirmation_id_for_token(token))
        self.assertEqual(stored["status"], "pending")

        store.docs[("userDebts", "debt-1")] = {
            "name": "Card",
            "type": "credit_card",
            "balance": 10,
            "interestRate": 0,
            "minimumPayment": 1,
        }
        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 200)
        self.assertEqual(store.docs[("userDebts", "debt-1")]["balance"], 11)

    def test_tampered_pending_record_is_not_applied(self):
        store = MemoryStore()
        status, proposed = call(
            store,
            {
                "action": "create",
                "collection": "userInvestments",
                "docId": "acct",
                "data": {
                    "name": "High-Yield Savings",
                    "type": "savings",
                    "balance": 5,
                    "monthlyContribution": 0,
                    "expectedReturn": 3.25,
                    "owner": "Joint",
                },
            },
        )
        self.assertEqual(status, 202)
        conf_id = confirmation_id_for_token(proposed["confirmToken"])
        store.docs[(CONFIRMATION_COLLECTION, conf_id)]["data"]["balance"] = 500000
        status, body = call(
            store,
            confirm_body(proposed),
            headers={"X-Abi-Approval": APPROVAL},
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "confirmation_rejected")
        self.assertNotIn(("userInvestments", "acct"), store.docs)
        self.assertEqual(store.confirmation(conf_id)["status"], "rejected")

    def test_rejects_unsafe_field_names_and_non_json(self):
        store = MemoryStore()
        status, body = call(
            store,
            {"action": "create", "collection": "budgetLogs", "data": {"net.worth": 1}},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_field_name")

        status, body = call(
            store,
            {"action": "create", "collection": "userDebts", "data": {"__proto__": "x"}},
        )
        self.assertEqual(status, 400)

        status, body = call(store, "[]")
        self.assertEqual(status, 400)
        status, body = call(store, {"action": "list"}, method="GET")
        self.assertEqual(status, 405)

    def test_cos_is_readable_and_not_writable(self):
        store = MemoryStore()
        store.docs[("new_weeklyPlans", "2026-W39")] = {"weeklyGoals": {"Physical": {"text": "lift"}}}
        store.docs[("dailyMetrics", "2026-09-27")] = {"productivityScore": 1}
        store.docs[("kanbanCards", "card-1")] = {"title": "Ship gateway", "status": "productBacklog"}

        status, body = call(store, {"action": "get", "collection": "new_weeklyPlans", "docId": "2026-W39"})
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["weeklyGoals"]["Physical"]["text"], "lift")

        status, body = call(store, {"action": "list", "collection": "kanbanCards", "limit": 5})
        self.assertEqual(status, 200)
        self.assertEqual(body["documents"][0]["id"], "card-1")

        status, body = call(
            store,
            {
                "action": "update",
                "collection": "dailyMetrics",
                "docId": "2026-09-27",
                "data": {"productivityScore": 9},
            },
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "collection_read_only")
        self.assertEqual(store.docs[("dailyMetrics", "2026-09-27")]["productivityScore"], 1)
        self.assertFalse(any(name == CONFIRMATION_COLLECTION for name, _doc in store.docs))

    def test_firebase_id_token_can_read_and_commit_but_not_skip_draft(self):
        store = MemoryStore()
        token = "aaa.bbb.ccc"

        def verify(presented):
            if presented != token:
                raise ValueError("bad token")
            return {"uid": "abi-uid"}

        headers = {"Authorization": f"Bearer {token}"}
        status, body = call(store, {"action": "capabilities"}, headers=headers, verify=verify)
        self.assertEqual(status, 200)

        status, proposed = call(
            store,
            {
                "action": "create",
                "collection": "userDebts",
                "docId": "from-user",
                "data": {
                    "name": "USAA",
                    "type": "credit_card",
                    "balance": 20,
                    "interestRate": 0.89,
                    "minimumPayment": 60,
                },
            },
            headers=headers,
            verify=verify,
        )
        self.assertEqual(status, 202)
        self.assertEqual(proposed["requestedBy"], "user:abi-uid")
        self.assertNotIn(("userDebts", "from-user"), store.docs)

        status, body = call(
            store,
            confirm_body(proposed),
            headers=headers,
            verify=verify,
        )
        self.assertEqual(status, 200)
        self.assertEqual(store.docs[("userDebts", "from-user")]["interestRate"], 0.89)

        status, body = call(
            store,
            {"action": "capabilities"},
            headers={"Authorization": "Bearer aaa.bbb.nope"},
            verify=verify,
        )
        self.assertEqual(status, 401)

    def test_finance_shape_matches_planner_managers(self):
        store = MemoryStore()
        status, body = call(
            store,
            {
                "action": "create",
                "collection": "userDebts",
                "data": {"name": "Card", "balance": 1},
            },
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_shape")

        status, body = call(
            store,
            {
                "action": "create",
                "collection": "userBills",
                "data": {
                    "name": "  Rent  ",
                    "category": "housing",
                    "budgeted": 3300,
                    "frequency": "monthly",
                    "autopay": False,
                    "dueDay": 1,
                    "actual": None,
                },
            },
        )
        self.assertEqual(status, 202)
        self.assertEqual(body["preview"]["data"]["name"], "Rent")
        self.assertEqual(body["preview"]["data"]["amount"], 3300)

        status, body = call(
            store,
            {
                "action": "create",
                "collection": "userDebts",
                "data": {
                    "name": "Card",
                    "type": "credit_card",
                    "balance": 1,
                    "interestRate": 0,
                    "minimumPayment": 1,
                    "createdAt": "2026-09-27T00:00:00Z",
                },
            },
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_field")

    def test_rules_keep_client_off_confirmations_and_image_function_stays(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        rules = (root / "firestore.rules").read_text()
        self.assertIn("collection != 'botGatewayConfirmations'", rules)
        self.assertIn("request.auth != null", rules)
        main = (root / "functions" / "main.py").read_text()
        self.assertIn("def on_image_upload", main)
        self.assertIn("RESIZED_IMAGE_MARKER", main)
        self.assertIn('collection("images")', main)
        self.assertIn("def bot_gateway", main)
        self.assertIn("_verify_firebase_id_token", main)
        guide = (root / "docs" / "bot-gateway.md").read_text()
        self.assertIn("dashboard-bb237", guide)
        self.assertIn("new_weeklyPlans", guide)
        self.assertIn("X-Abi-Approval", guide)

    def test_jsonable_timestamps(self):
        stamped = datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(to_jsonable(stamped), "2026-09-27T12:00:00Z")
        self.assertEqual(to_jsonable({"ok": True, "n": 1}), {"ok": True, "n": 1})


if __name__ == "__main__":
    unittest.main()
