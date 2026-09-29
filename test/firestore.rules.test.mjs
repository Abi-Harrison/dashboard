/**
 * Client rules for Gearshift.
 *
 * Abi uid 1SORgD4xeFYG5hMRAmPjw6iUyJk2 can read and write the collections
 * the signed-in app uses. Any other authenticated uid is denied.
 * botGatewayConfirmations stays deny-all, including for Abi.
 *
 * Run (Firestore emulator, no live project):
 *   npm run test:rules
 */
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const ABI_UID = "1SORgD4xeFYG5hMRAmPjw6iUyJk2";
const OTHER_UID = "otherAuthenticatedUid00001";

let testEnv;

function abiDb() {
  return testEnv.authenticatedContext(ABI_UID).firestore();
}

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function claimedAdminDb() {
  return testEnv.authenticatedContext(OTHER_UID, { admin: true }).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-dashboard-bb237",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "dailyStudyLogs", "2026-09-28"), { totalMinutes: 30 });
    await setDoc(doc(db, "amRoutineLogs", "am1"), { completed: true });
    await setDoc(doc(db, "pmRoutineLogs", "pm1"), { completed: true });
    await setDoc(doc(db, "projects", "p1"), { name: "sprint", status: "active" });
    await setDoc(doc(db, "kanbanCards", "c1"), { title: "card", status: "todo" });
    await setDoc(doc(db, "monthlyPlans", "2026-09"), { events: [] });
    await setDoc(doc(db, "study", "2026-09-28-1"), { topic: "rules", type: "studySession" });
    await setDoc(doc(db, "userDebts", "d1"), { name: "card", balance: 1 });
    await setDoc(doc(db, "fitnessGoals", "g1", "stepLogs", "2026-09-28"), { steps: 1 });
    await setDoc(doc(db, "botGatewayConfirmations", "draft1"), { payloadHash: "abc" });
    await setDoc(doc(db, "botGatewayConfirmations", "draft1", "nested", "x"), { leak: true });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test("Gearshift signed in as Abi can read the dashboard collections", async () => {
  const db = abiDb();
  await assertSucceeds(getDocs(collection(db, "dailyStudyLogs")));
  await assertSucceeds(getDoc(doc(db, "dailyStudyLogs", "2026-09-28")));
  await assertSucceeds(getDocs(collection(db, "amRoutineLogs")));
  await assertSucceeds(getDocs(collection(db, "pmRoutineLogs")));
  await assertSucceeds(getDocs(collection(db, "kanbanCards")));
  await assertSucceeds(getDocs(query(collection(db, "projects"), where("status", "==", "active"))));
  await assertSucceeds(getDoc(doc(db, "monthlyPlans", "2026-09")));
  await assertSucceeds(getDoc(doc(db, "study", "2026-09-28-1")));
  await assertSucceeds(getDoc(doc(db, "userDebts", "d1")));
  await assertSucceeds(getDoc(doc(db, "fitnessGoals", "g1", "stepLogs", "2026-09-28")));
});

test("Gearshift signed in as Abi can write study logs and update a kanban card", async () => {
  const db = abiDb();
  const studyRef = doc(db, "study", "2026-09-28-abi");
  await assertSucceeds(setDoc(studyRef, { topic: "deep work", type: "studySession", durationMinutes: 25 }));
  await assertSucceeds(updateDoc(doc(db, "kanbanCards", "c1"), { status: "doing" }));
  await assertSucceeds(setDoc(doc(db, "fitnessGoals", "g1", "stepLogs", "2026-09-29"), { steps: 2 }));
  await assertSucceeds(deleteDoc(studyRef));
});

test("another authenticated uid cannot read or write Gearshift data", async () => {
  const db = otherDb();
  await assertFails(getDocs(collection(db, "dailyStudyLogs")));
  await assertFails(getDoc(doc(db, "dailyStudyLogs", "2026-09-28")));
  await assertFails(getDocs(collection(db, "amRoutineLogs")));
  await assertFails(getDocs(collection(db, "pmRoutineLogs")));
  await assertFails(getDocs(collection(db, "kanbanCards")));
  await assertFails(getDocs(collection(db, "projects")));
  await assertFails(getDoc(doc(db, "study", "2026-09-28-1")));
  await assertFails(getDoc(doc(db, "userDebts", "d1")));
  await assertFails(getDoc(doc(db, "fitnessGoals", "g1", "stepLogs", "2026-09-28")));
  await assertFails(setDoc(doc(db, "study", "intruder"), { topic: "nope" }));
  await assertFails(updateDoc(doc(db, "kanbanCards", "c1"), { status: "done" }));
  await assertFails(deleteDoc(doc(db, "projects", "p1")));
});

test("signed-out clients are denied", async () => {
  const db = anonDb();
  await assertFails(getDocs(collection(db, "dailyStudyLogs")));
  await assertFails(setDoc(doc(db, "dailyStudyLogs", "x"), { totalMinutes: 1 }));
});

test("an admin custom claim does not unlock a different uid", async () => {
  const db = claimedAdminDb();
  await assertFails(getDoc(doc(db, "dailyStudyLogs", "2026-09-28")));
  await assertFails(setDoc(doc(db, "study", "admin-claim"), { topic: "nope" }));
});

test("botGatewayConfirmations stays deny-all for Abi and everyone else", async () => {
  const abi = abiDb();
  const other = otherDb();
  await assertFails(getDoc(doc(abi, "botGatewayConfirmations", "draft1")));
  await assertFails(getDocs(collection(abi, "botGatewayConfirmations")));
  await assertFails(setDoc(doc(abi, "botGatewayConfirmations", "draft2"), { payloadHash: "nope" }));
  await assertFails(updateDoc(doc(abi, "botGatewayConfirmations", "draft1"), { payloadHash: "edited" }));
  await assertFails(deleteDoc(doc(abi, "botGatewayConfirmations", "draft1")));
  await assertFails(getDoc(doc(abi, "botGatewayConfirmations", "draft1", "nested", "x")));
  await assertFails(getDoc(doc(other, "botGatewayConfirmations", "draft1")));
  await assertFails(setDoc(doc(other, "botGatewayConfirmations", "draft3"), { payloadHash: "nope" }));
});
