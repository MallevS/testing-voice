"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface Group {
    id: string;
    name: string;
    adminEmail: string;
    credits: number;     
    usedToday: number;
    members: { email: string }[];
}

interface Activity {
    id: string;
    action: string;
    timestamp: string;
    cost: number;
    audioSeconds?: number;
}

export default function UserDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [group, setGroup] = useState<Group | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;
    const totalPages = Math.ceil(activities.length / itemsPerPage);
    const paginatedActivities = activities.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );

    const CREDIT_TO_USD = 1;

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = auth.onAuthStateChanged(async (u) => {
            if (!u) {
                setLoading(false);
                return;
            }
            setUser(u);

            const userDoc = await getDoc(doc(db, "users", u.uid));
            if (!userDoc.exists()) {
                setLoading(false);
                return;
            }
            const userData = userDoc.data();
            if (!userData.groupId) {
                setLoading(false);
                return;
            }

            const groupDoc = await getDoc(doc(db, "groups", userData.groupId));
            if (!groupDoc.exists()) {
                setLoading(false);
                return;
            }
            const groupData = groupDoc.data() as any;

            const adminEmails = await Promise.all(
                (groupData.admins || []).map(async (adminUid: string) => {
                    const adminDoc = await getDoc(doc(db, "users", adminUid));
                    return adminDoc.exists() ? adminDoc.data().email : "";
                })
            );

            const members = await Promise.all(
                (groupData.users || []).map(async (memberUid: string) => {
                    const memberDoc = await getDoc(doc(db, "users", memberUid));
                    return memberDoc.exists() ? { email: memberDoc.data().email } : null;
                })
            );

            const activityRef = collection(db, "groups", userData.groupId, "activity");
            const q = query(activityRef, orderBy("timestamp", "desc"), limit(50));
            const snap = await getDocs(q);

            const acts: Activity[] = snap.docs.map((d) => {
                const data = d.data();
                let ts: string = "";
                if (data.timestamp instanceof Timestamp) ts = data.timestamp.toDate().toISOString();
                else if (typeof data.timestamp === "string") ts = data.timestamp;

                const costRounded = (data.cost ?? 0);
                const audioRounded = data.audioSeconds ? Math.round(data.audioSeconds) : 0;

                return {
                    id: d.id,
                    action: `Model: ${data.model}, Cost: ${costRounded.toFixed(3)} credits${audioRounded ? `, Audio: ${audioRounded}s` : ""}`,
                    timestamp: ts,
                    cost: costRounded,
                    audioSeconds: audioRounded,
                };
            });

            setActivities(acts);

            const today = new Date();
            const usedToday = acts
                .filter(a => new Date(a.timestamp).toDateString() === today.toDateString())
                .reduce((sum, a) => sum + a.cost, 0);

            const totalCredits = groupData.credits ?? 0;

            setGroup({
                id: groupDoc.id,
                name: groupData.name,
                adminEmail: adminEmails.filter(Boolean).join(", "),
                credits: totalCredits,
                usedToday: usedToday,
                members: members.filter(Boolean) as { email: string }[],
            });

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-lg">Loading dashboard...</div>;
    if (!user) return <div className="min-h-screen flex items-center justify-center text-lg">Please log in to see your dashboard.</div>;

    return (
        <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
         
            <div className="text-black p-6 flex items-center justify-start mb-5 gap-5">
                <button
                    onClick={() => router.push("/")}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                    Back to Home
                </button>
                <div>
                    <h1 className="text-3xl font-bold">Welcome back, {user.displayName || user.email} 👋</h1>
                    <p className="text-sm opacity-90">Here’s what’s happening in your group today.</p>
                </div>
                {user.photoURL && (
                    <Image
                        src={user.photoURL}
                        alt="User avatar"
                        width={60}
                        height={60}
                        className="rounded-full border-2 border-white shadow"
                    />
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4">Group Overview</h2>
                    {group ? (
                        <>
                            <p><span className="font-semibold">Name:</span> {group.name}</p>
                            <p><span className="font-semibold">Admin:</span> {group.adminEmail}</p>
                            <p>
                                <span className="font-semibold">Total Credits:</span> 
                                ${ (group.credits * CREDIT_TO_USD).toFixed(2) } ({group.credits.toFixed(3)} credits)
                            </p>
                            <p>
                                <span className="font-semibold">Used Today:</span> 
                                ${ (group.usedToday * CREDIT_TO_USD).toFixed(2) } ({group.usedToday.toFixed(3)} credits)
                            </p>
                        </>
                    ) : (
                        <p className="text-gray-500">You are not in a group yet.</p>
                    )}
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4">Group Members</h2>
                    {group?.members?.length ? (
                        <ul className="space-y-2 max-h-[250px] overflow-y-auto">
                            {group.members.map((m, i) => (
                                <li key={i} className="flex items-center gap-2 text-gray-700">
                                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                                        {m.email.charAt(0).toUpperCase()}
                                    </div>
                                    {m.email}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500">No members found.</p>
                    )}
                </div>
            </div>

            <div className="mt-6">
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
                                                    {new Date(a.timestamp).toLocaleTimeString(undefined, {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

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
