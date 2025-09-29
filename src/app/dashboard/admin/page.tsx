"use client";
import { useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where, Timestamp, orderBy, limit } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import axios from "axios";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  groupId?: string;
}

interface Activity {
  id: string;
  userId?: string;
  userName?: string;
  action: string;
  timestamp: string;
  cost: number;
  audioSeconds?: number;
}

interface Group {
  id: string;
  name: string;
  credits: number;
  admins: string[];
  users: string[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const auth = getAuth();

  const [group, setGroup] = useState<Group | null>(null);
  const [groupUsers, setGroupUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  const [addUserExpanded, setAddUserExpanded] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const CREDIT_TO_USD = 1; // 1 credit = $1 for display

  // Fetch group, users & activities
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          setError("User data not found.");
          setLoading(false);
          return;
        }

        const userData = userDoc.data() as User;
        if (!userData.groupId) {
          setError("No group assigned to this user.");
          setLoading(false);
          return;
        }

        // Get group
        const groupDoc = await getDoc(doc(db, "groups", userData.groupId));
        if (!groupDoc.exists()) {
          setError("Group not found.");
          setLoading(false);
          return;
        }
        const groupData = groupDoc.data() as Group;
        const { id, ...restGroupData } = groupData;
        setGroup({ id: groupDoc.id, ...restGroupData });

        // Get users
        const usersList: User[] = [];
        if (groupData.users?.length) {
          const usersSnapshot = await getDocs(
            query(collection(db, "users"), where("__name__", "in", groupData.users))
          );
          usersSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            usersList.push({
              id: docSnap.id,
              name: data.name,
              email: data.email,
              role: data.role,
              groupId: data.groupId,
            });
          });
        }
        setGroupUsers(usersList);

        // Fetch recent activities
        const activityRef = collection(db, "groups", userData.groupId, "activity");
        const activitySnap = await getDocs(query(activityRef, orderBy("timestamp", "desc"), limit(50)));
        const acts: Activity[] = activitySnap.docs.map((d) => {
          const data = d.data();
          let ts: string = "";
          if (data.timestamp instanceof Timestamp) ts = data.timestamp.toDate().toISOString();
          else if (typeof data.timestamp === "string") ts = data.timestamp;

          return {
            id: d.id,
            userId: data.userId,
            userName: data.userName,
            action: data.model || "Model usage",
            timestamp: ts,
            cost: data.cost ?? 0,
            audioSeconds: data.audioSeconds ?? 0,
          };
        });
        setActivities(acts);

        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error fetching group data.");
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const handleAddUser = async () => {
    if (!auth.currentUser || !group) return alert("Not logged in or group not loaded");

    try {
      const res = await axios.post(
        "/api/users/add",
        { email, name, groupId: group.id, password },
        { headers: { "x-user-uid": auth.currentUser.uid } }
      );

      const returnedPassword = res.data.password;
      setGeneratedPassword(returnedPassword);

      alert(`User added successfully! Password: ${returnedPassword}`);
      setEmail("");
      setName("");
      setPassword("");

      // Refresh users
      if (group.users?.length) {
        const usersSnapshot = await getDocs(
          query(collection(db, "users"), where("__name__", "in", group.users))
        );
        const usersList: User[] = [];
        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          usersList.push({
            id: docSnap.id,
            name: data.name,
            email: data.email,
            role: data.role,
            groupId: data.groupId,
          });
        });
        setGroupUsers(usersList);
      }
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.error || err.message));
    }
  };

  // Mini stats calculations
  const totalSpend = activities.reduce((sum, a) => sum + a.cost, 0);
  const todayStr = new Date().toDateString();
  const activeUsers = Array.from(
    new Set(activities.filter(a => new Date(a.timestamp).toDateString() === todayStr).map(a => a.userName))
  ).length;
  const usedToday = activities
    .filter(a => new Date(a.timestamp).toDateString() === todayStr)
    .reduce((sum, a) => sum + a.cost, 0);
  const avgCost = activities.length ? totalSpend / activities.length : 0;
  const topUser = activities.reduce(
    (prev, curr) => (curr.cost > prev.cost ? curr : prev),
    { id: "", userName: "", action: "", timestamp: "", cost: 0 }
  );

  const totalPages = Math.ceil(activities.length / itemsPerPage);
  const paginatedActivities = activities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center text-lg">Loading dashboard...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>;
  if (!group) return <div className="min-h-screen flex items-center justify-center text-lg">No group information.</div>;

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
      <div className="flex justify-start items-center mb-6 gap-5">
        <button
          onClick={() => router.push("/")}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          Back to Home
        </button>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      {/* KPI Panel */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
          <span className="text-gray-500 text-sm">Total Users</span>
          <span className="text-2xl font-bold">{groupUsers.length}</span>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
          <span className="text-gray-500 text-sm">Total Credits</span>
          <span className="text-2xl font-bold">${(group.credits * CREDIT_TO_USD).toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
          <span className="text-gray-500 text-sm">Used Today</span>
          <span className="text-2xl font-bold">${usedToday.toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
          <span className="text-gray-500 text-sm">Active Users Today</span>
          <span className="text-2xl font-bold">{activeUsers}</span>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
          <span className="text-gray-500 text-sm">Avg Cost</span>
          <span className="text-2xl font-bold">${avgCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Group Info & Add User */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Group Info */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Group Info</h2>
          <p><strong>Group Name:</strong> {group.name}</p>
          <p><strong>Credits Remaining:</strong> ${(group.credits * CREDIT_TO_USD).toFixed(2)}</p>
          <p><strong>Total Spend:</strong> ${totalSpend.toFixed(2)}</p>
          <p><strong>Top User:</strong> {topUser.userName} (${topUser.cost.toFixed(2)})</p>
        </div>

        {/* Add User Form */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Add User</h2>
            <button onClick={() => setAddUserExpanded(prev => !prev)} className="text-blue-600 underline">
              {addUserExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
          {addUserExpanded && (
            <>
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Password (optional)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddUser}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Add User
              </button>
              {generatedPassword && (
                <p className="mt-4 text-sm text-blue-700">
                  Generated Password: <strong>{generatedPassword}</strong>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        {activities.length > 0 ? (
          <>
            {Object.entries(
              paginatedActivities.reduce((acc, act) => {
                const day = new Date(act.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                if (!acc[day]) acc[day] = [];
                acc[day].push(act);
                return acc;
              }, {} as Record<string, Activity[]>)
            ).map(([day, acts]) => (
              <div key={day} className="mb-6">
                <h3 className="text-gray-500 font-medium mb-2">{day}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {acts.map((a) => {
                    let costColor = "bg-green-200 text-green-800";
                    if (a.cost >= 0.1) costColor = "bg-red-200 text-red-800";
                    else if (a.cost >= 0.05) costColor = "bg-yellow-200 text-yellow-800";

                    return (
                      <div
                        key={a.id}
                        className="bg-white p-4 rounded-lg shadow hover:shadow-lg transition-shadow flex flex-col justify-between"
                        title={`User: ${a.userName || "Unknown"}\nAction: ${a.action}\nExact: ${new Date(a.timestamp).toLocaleString()}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">
                            {a.audioSeconds && a.audioSeconds > 0 ? "🎤" : "📝"}
                          </span>
                          <span className="font-medium">
                            {a.audioSeconds && a.audioSeconds > 0
                              ? `Audio response (${Math.round(a.audioSeconds)}s)`
                              : "Text response"}
                          </span>
                        </div>
                        <div className={`inline-block px-2 py-1 rounded-full text-sm font-semibold ${costColor} mb-1`}>
                          Cost: ${ (a.cost * CREDIT_TO_USD).toFixed(2) } ({a.cost.toFixed(3)} credits)
                        </div>
                        <div className="text-gray-400 text-xs">
                          {new Date(a.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Pagination */}
            <div className="flex justify-center mt-4 gap-2">
              <button
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                ← Previous
              </button>
              <span className="px-3 py-1">
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next → 
              </button>
            </div>
          </>
        ) : (
          <p className="text-gray-500">No recent activity.</p>
        )}
      </div>
    </div>
  );
}
