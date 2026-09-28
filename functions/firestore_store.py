"""Firestore adapter for the bot gateway.

Target writes happen inside one transaction with the confirmation update, so a
retried confirm cannot apply twice. Reads convert Firestore timestamps and
other admin-SDK values into JSON. Writes persist the approved JSON as-is.
"""

from __future__ import annotations

import base64
import copy
from datetime import datetime, timezone

from firebase_admin import firestore

from bot_gateway import (
    ALLOWED_COLLECTIONS,
    CONFIRMATION_COLLECTION,
    GatewayError,
    assess_confirmation,
    resolve_confirmation,
    sealed_equal,
)

_require_allowed_message = "collection_not_allowed"


def _require_allowed(collection: str) -> None:
    if collection not in ALLOWED_COLLECTIONS:
        raise GatewayError(403, _require_allowed_message)


class FirestoreGatewayStore:
    def __init__(self, db):
        self._db = db

    def get_doc(self, collection: str, doc_id: str) -> dict | None:
        _require_allowed(collection)
        snap = self._db.collection(collection).document(doc_id).get()
        if not snap.exists:
            return None
        return to_jsonable(snap.to_dict() or {})

    def list_docs(self, collection: str, limit: int) -> list[dict]:
        _require_allowed(collection)
        rows = []
        for snap in self._db.collection(collection).limit(limit).stream():
            rows.append({"id": snap.id, "data": to_jsonable(snap.to_dict() or {})})
        return rows

    def put_confirmation(self, doc_id: str, record: dict) -> None:
        (
            self._db.collection(CONFIRMATION_COLLECTION)
            .document(doc_id)
            .set(copy.deepcopy(record))
        )

    def consume_and_execute(self, doc_id: str, now: int, expected_hash: str) -> dict:
        outcome: dict = {"decision": "rejected"}
        conf_ref = self._db.collection(CONFIRMATION_COLLECTION).document(doc_id)

        @firestore.transactional
        def _run(transaction):
            outcome.clear()
            outcome["decision"] = "rejected"
            snap = conf_ref.get(transaction=transaction)
            if not snap.exists:
                outcome["decision"] = "missing"
                return

            record = snap.to_dict() or {}
            stored_hash = record.get("payloadHash")
            if not isinstance(stored_hash, str) or not sealed_equal(stored_hash, expected_hash):
                outcome["decision"] = "mismatch"
                return
            preview = assess_confirmation(record, now)
            assigned_id = None
            target_exists = None
            target_ref = None
            if preview == "ready":
                collection = record.get("collection")
                _require_allowed(collection)
                col = self._db.collection(collection)
                if record.get("action") == "create" and not record.get("docId"):
                    target_ref = col.document()
                    assigned_id = target_ref.id
                    target_exists = False
                else:
                    target_ref = col.document(record.get("docId"))
                    target_exists = target_ref.get(transaction=transaction).exists

            plan = resolve_confirmation(
                record,
                now,
                target_exists=target_exists,
                assigned_id=assigned_id,
            )
            new_status = plan.get("new_status")
            if new_status and new_status != "consumed":
                transaction.update(conf_ref, {"status": new_status})
                outcome["decision"] = plan["decision"]
                return
            if plan["decision"] != "consumed":
                outcome["decision"] = plan["decision"]
                return

            result_id = plan["docId"]
            if plan["write"] == "set":
                transaction.set(target_ref, plan["data"])
            elif plan["write"] == "update":
                transaction.update(target_ref, plan["data"])
            elif plan["write"] == "delete":
                transaction.delete(target_ref)
            else:
                transaction.update(conf_ref, {"status": "rejected"})
                outcome["decision"] = "rejected"
                return

            transaction.update(
                conf_ref,
                {
                    "status": "consumed",
                    "consumedAt": now,
                    "resultDocId": result_id,
                },
            )
            outcome.clear()
            outcome.update(
                {
                    "decision": "consumed",
                    "docId": result_id,
                    "action": record.get("action"),
                    "collection": record.get("collection"),
                }
            )

        _run(self._db.transaction())
        return outcome


def to_jsonable(value):
    """Convert an Admin SDK document value into JSON-safe data."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        text = value.astimezone(timezone.utc).isoformat()
        return text.replace("+00:00", "Z")
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if isinstance(value, (bytes, bytearray)):
        return {"base64": base64.b64encode(bytes(value)).decode("ascii")}
    type_name = type(value).__name__
    if type_name == "GeoPoint":
        return {"latitude": value.latitude, "longitude": value.longitude}
    if type_name == "DocumentReference":
        return value.path
    return str(value)
