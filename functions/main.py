# functions/main.py

import json
import os.path
import time

from firebase_admin import auth, firestore, initialize_app, storage
from firebase_functions import https_fn, storage_fn
from firebase_functions.params import SecretParam

from bot_gateway import handle_gateway
from firestore_store import FirestoreGatewayStore

# Initialize the Firebase Admin SDK
initialize_app()

# Bound from Secret Manager at deploy time. Values are never committed.
BOT_API_KEYS = SecretParam(
    "BOT_API_KEYS",
    description="JSON map of axis-bot id to API key, used for reads and mutation proposals.",
)
ABI_APPROVAL_SECRET = SecretParam(
    "ABI_APPROVAL_SECRET",
    description="Secret only Abi holds. Alternative to a Firebase ID token for confirming finance writes.",
)


def _verify_firebase_id_token(token: str) -> dict:
    """Verify a Firebase Auth ID token. Raises if the token is not valid."""
    decoded = auth.verify_id_token(token)
    uid = decoded.get("uid") or decoded.get("sub")
    if not isinstance(uid, str) or not uid:
        raise ValueError("id token missing uid")
    return {"uid": uid}

# We will look for this marker in the filename to identify resized images.
RESIZED_IMAGE_MARKER = "_800x800"

@storage_fn.on_object_finalized(bucket="dashboard-bb237.firebasestorage.app")
def on_image_upload(event: storage_fn.CloudEvent[storage_fn.StorageObjectData]):
    """
    Triggered when a file is finalized in Cloud Storage.
    This function ONLY processes resized images and saves their details to Firestore.
    """
    
    file_path = event.data.name
    
    # --- THIS IS THE CORRECTED LOGIC ---
    # We now check if our marker string is contained anywhere in the file path.
    # This works for any file type (e.g., .jpg, .png, etc.).
    if RESIZED_IMAGE_MARKER not in file_path:
        print(f"Ignoring file: {file_path}. It is not a resized image.")
        return None

    # If it IS a resized image, proceed.
    print(f"Processing RESIZED file: {file_path}")
    
    bucket_name = event.data.bucket
    
    directory_path = os.path.dirname(file_path)
    associated_room = os.path.basename(directory_path)

    if not associated_room or associated_room == ".":
        associated_room = None
    else:
        print(f"Parent folder found. Setting associatedRoom to: '{associated_room}'")

    file_name = os.path.basename(file_path)

    try:
        bucket = storage.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
        public_url = blob.public_url
        print(f"Got public URL for resized image: {public_url}")

    except Exception as e:
        print(f"Error getting public URL: {e}")
        return

    try:
        firestore_client = firestore.client()
        
        image_record = {
            "title": file_name,
            "context": directory_path,
            "imageUrl": public_url,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "storagePath": file_path,
        }

        if associated_room:
            image_record["associatedRoom"] = associated_room
        
        doc_ref = firestore_client.collection("images").add(image_record)
        print(f"Successfully created Firestore document for resized image: {doc_ref[1].id}")

    except Exception as e:
        print(f"Error creating Firestore document: {e}")


@https_fn.on_request(
    region="us-central1",
    secrets=[BOT_API_KEYS, ABI_APPROVAL_SECRET],
    invoker="public",
    timeout_sec=30,
)
def bot_gateway(req: https_fn.Request) -> https_fn.Response:
    """Finance drafts and CoS reads. See docs/bot-gateway.md."""
    raw_body = ""
    try:
        raw_body = req.get_data(cache=False, as_text=True) or ""
        status, payload = handle_gateway(
            req.method,
            req.headers,
            raw_body,
            store=FirestoreGatewayStore(firestore.client()),
            bot_keys_raw=BOT_API_KEYS.value,
            approval_secret=ABI_APPROVAL_SECRET.value,
            now=int(time.time()),
            verify_id_token=_verify_firebase_id_token,
        )
    except Exception as exc:
        print(f"bot_gateway error: {type(exc).__name__}")
        status = 500
        payload = {"ok": False, "error": "internal"}

    print(
        "bot_gateway http=%s result=%s collection=%s"
        % (
            status,
            payload.get("error") or payload.get("status") or payload.get("action"),
            payload.get("collection"),
        )
    )
    return https_fn.Response(
        json.dumps(payload, separators=(",", ":")),
        status=status,
        mimetype="application/json",
    )