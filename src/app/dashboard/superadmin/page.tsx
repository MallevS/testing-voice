"use client";

import { useState, useEffect } from "react";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { db } from "../../firebaseConfig";
import { doc, collection, getDoc, getDocs, setDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Modal from "../../components/Modal";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  groupId?: string;
}

interface Group {
  id: string;
  name: string;
  admins: User[];
  users: User[];
  credits: number;
  dollars: number;
  usedToday: number;
  totalSpend: number;
}

interface Activity {
  id: string;
  model: string;
  cost: number;
  timestamp: string;
  audioSeconds?: number;
}

export default function SuperadminDashboard() {
  const router = useRouter();
  const auth = getAuth();
  const [groupName, setGroupName] = useState("");
  const [groupCredits, setGroupCredits] = useState<number | "">("");
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);

  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const [allAdmins, setAllAdmins] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activities, setActivities] = useState<Record<string, Activity[]>>({});

  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const showModal = (msg: string) => setModalMessage(msg);
  const closeModal = () => setModalMessage(null);

  const CREDIT_TO_USD = 1;

  useEffect(() => {
    const fetchAdmins = async () => {
      const snapshot = await getDocs(collection(db, "users"));
      const users: User[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.role === "user" || data.role === "admin") {
          users.push({ id: doc.id, ...data } as User);
        }
      });
      setAllAdmins(users);
    };
    fetchAdmins();
  }, []);

  useEffect(() => {
    const fetchGroups = async () => {
      const groupSnapshot = await getDocs(collection(db, "groups"));
      const groupsData: Group[] = [];
      const acts: Record<string, Activity[]> = {};

      for (const gDoc of groupSnapshot.docs) {
        const gData: any = gDoc.data();

        const adminUsers: User[] = await Promise.all(
          (gData.admins || []).map(async (uid: string) => {
            const docSnap = await getDoc(doc(db, "users", uid));
            return docSnap.exists() ? { id: uid, ...docSnap.data() } as User : { id: uid, name: uid, email: uid, role: "admin" };
          })
        );

        const normalUsers: User[] = await Promise.all(
          (gData.users || []).map(async (uid: string) => {
            const docSnap = await getDoc(doc(db, "users", uid));
            return docSnap.exists() ? { id: uid, ...docSnap.data() } as User : { id: uid, name: uid, email: uid, role: "user" };
          })
        );

        const actRef = collection(db, "groups", gDoc.id, "activity");
        const q = query(actRef, orderBy("timestamp", "desc"), limit(50));
        const actSnap = await getDocs(q);

        const groupActs: Activity[] = actSnap.docs.map(d => {
          const data: any = d.data();
          let ts = "";
          if (data.timestamp?.toDate) ts = data.timestamp.toDate().toISOString();
          else if (typeof data.timestamp === "string") ts = data.timestamp;
          return {
            id: d.id,
            model: data.model ?? "unknown",
            cost: data.cost ?? 0,
            timestamp: ts,
            audioSeconds: data.audioSeconds ? Math.round(data.audioSeconds) : 0,
          };
        });

        acts[gDoc.id] = groupActs;

        const today = new Date();
        const usedToday = groupActs
          .filter(a => new Date(a.timestamp).toDateString() === today.toDateString())
          .reduce((sum, a) => sum + a.cost, 0);

        const totalSpend = groupActs.reduce((sum, a) => sum + a.cost, 0);

        groupsData.push({
          id: gDoc.id,
          name: gData.name,
          admins: adminUsers,
          users: normalUsers,
          credits: gData.credits ?? 0,
          dollars: (gData.credits ?? 0) * CREDIT_TO_USD,
          usedToday,
          totalSpend,
        });
      }

      setGroups(groupsData);
      setActivities(acts);
    };
    fetchGroups();
  }, []);

  const handleCreateAdmin = async () => {
    if (!newAdminName || !newAdminEmail || !newAdminPassword) return showModal("Enter all fields");

    try {
      const res = await fetch("/api/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAdminName, email: newAdminEmail, password: newAdminPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      await setDoc(doc(db, "users", data.uid), {
        name: newAdminName,
        email: newAdminEmail,
        role: "admin",
        groupId: "",
        createdAt: serverTimestamp(),
      });

      setAllAdmins(prev => [...prev, { id: data.uid, name: newAdminName, email: newAdminEmail, role: "admin" }]);
      setSelectedAdmins(prev => [...prev, data.uid]);
      setNewAdminName(""); setNewAdminEmail(""); setNewAdminPassword("");
      showModal(`Admin created: ${newAdminEmail}`);
    } catch (err: any) {
      showModal("Error: " + err.message);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName || !selectedAdmins.length || !groupCredits) return showModal("Fill all fields");

    try {
      const groupRef = doc(collection(db, "groups"));
      await setDoc(groupRef, {
        name: groupName,
        admins: selectedAdmins,
        users: [],
        credits: groupCredits,
        createdAt: serverTimestamp(),
      });

      for (const uid of selectedAdmins) {
        await setDoc(doc(db, "users", uid), { groupId: groupRef.id }, { merge: true });
      }

      showModal("Group created successfully!");
      setGroupName(""); setGroupCredits(""); setSelectedAdmins([]);

      const snapshot = await getDocs(collection(db, "groups"));
      const groupsData: Group[] = [];
      snapshot.forEach(doc => groupsData.push({ id: doc.id, ...doc.data() } as Group));
      setGroups(groupsData);
    } catch (err: any) {
      showModal("Error: " + err.message);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
      <div className="flex justify-start items-center mb-6 gap-5">
        <button onClick={() => router.push("/")} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
          Back to Home
        </button>
        <h1 className="text-3xl font-bold">Superadmin Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Create Group & Admins</h2>
          <input type="text" placeholder="Group Name" value={groupName} onChange={e => setGroupName(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 w-full mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="number" placeholder="Credits for group" value={groupCredits}
            onChange={e => setGroupCredits(e.target.value === "" ? "" : Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-2 w-full mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <div className="mb-4 border p-4 rounded bg-gray-50">
            <h3 className="font-semibold mb-2">Create New Admin</h3>
            <div className="flex flex-col md:flex-row gap-2">
              <input type="text" placeholder="Admin Name" value={newAdminName} onChange={e => setNewAdminName(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full md:w-1/4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="email" placeholder="Admin Email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full md:w-1/4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" placeholder="Password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full md:w-1/4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleCreateAdmin} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Create Admin</button>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold mb-2">Assign Admins to Group</h3>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto border p-2 rounded bg-gray-50">
              {allAdmins.map(user => (
                <label key={user.id} className="flex items-center gap-2">
                  <input type="checkbox" value={user.id} checked={selectedAdmins.includes(user.id)}
                    onChange={e => {
                      const id = e.target.value;
                      setSelectedAdmins(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    className="h-4 w-4" />
                  <span>{user.name} ({user.email})</span>
                </label>
              ))}
            </div>
          </div>
          <button onClick={handleCreateGroup} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Create Group
          </button>
        </div>

        <div className="space-y-6">
          {groups.map(g => (
            <div key={g.id} className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">{g.name}</h2>
              <p><span className="font-semibold">Admins:</span> {g.admins.map(a => a.email).join(", ")}</p>
              <p><span className="font-semibold">Members:</span> {g.users.map(u => u.email).join(", ") || "None"}</p>
              <p>
                <span className="font-semibold">Balance:</span> $
                {(g.dollars ?? 0).toFixed(2)} ({(g.credits ?? 0).toFixed(3)} credits)
              </p>
              <p>
                <span className="font-semibold">Used Today:</span> ${(g.usedToday ?? 0).toFixed(2)}
              </p>
              <p>
                <span className="font-semibold">Total Spend:</span> ${(g.totalSpend ?? 0).toFixed(2)}
              </p>
          

              {activities[g.id] && activities[g.id].length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Recent Activity</h3>
                  <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                    {activities[g.id].slice(0, 5).map(a => (
                      <li key={a.id} className="bg-gray-50 p-2 rounded">
                        <div className="flex justify-between text-sm">
                          <span>{a.model}</span>
                          <span>${(a.cost ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="text-gray-500 text-xs">{new Date(a.timestamp).toLocaleString()}</div>
                        {a.audioSeconds ? <div className="text-xs text-purple-700">Audio: {a.audioSeconds}s</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {modalMessage && <Modal message={modalMessage} onClose={closeModal} />}
    </div>
  );
}
