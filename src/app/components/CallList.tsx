"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    getDoc,
    getDocs,
    where,
} from "firebase/firestore";
import { auth, db } from "@/app/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

interface CallEntry {
    id: string;
    phoneNumber: string;
    status: "pending" | "in-progress" | "completed" | "failed" | "ringing" | "calling" | "busy" | "no-answer";
    lastCallTimestamp?: any;
    addedBy: string;
    calledBy?: string | null;
    callSid?: string | null;
}

const CallList = () => {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [callList, setCallList] = useState<CallEntry[]>([]);
    const [newNumber, setNewNumber] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [assignedNumber, setAssignedNumber] = useState("");
    const [loadingGroupData, setLoadingGroupData] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user);
                const userSnap = await getDoc(doc(db, "users", user.uid));
                const userData = userSnap.data();
                if (userData?.groupId) {
                    setGroupId(userData.groupId);
                }
                setIsAdmin(userData?.role === "admin");
            } else {
                setCurrentUser(null);
            }
        });
        return () => unsub();
    }, []);

    // Load group info
    useEffect(() => {
        if (!groupId) return;
        const unsub = onSnapshot(doc(db, "groups", groupId), (snapshot) => {
            const data = snapshot.data();
            if (data?.assignedNumber) {
                setAssignedNumber(data.assignedNumber);
            }
            setLoadingGroupData(false);
        });
        return () => unsub();
    }, [groupId]);

    // 🔥 Real-time call list updates
    useEffect(() => {
        if (!groupId) return;
        const q = query(
            collection(db, "groups", groupId, "callList"),
            orderBy("lastCallTimestamp", "desc")
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const calls: CallEntry[] = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as CallEntry[];
            setCallList(calls);
        });
        return () => unsub();
    }, [groupId]);

    const addNumber = async () => {
        if (!newNumber.trim() || !groupId || !currentUser) return;
        await addDoc(collection(db, "groups", groupId, "callList"), {
            phoneNumber: newNumber.trim(),
            status: "pending",
            addedBy: currentUser.uid,
            calledBy: null,
            lastCallTimestamp: null,
            callSid: null,
        });
        setNewNumber("");
    };

    const updateStatus = async (id: string, status: string) => {
        if (!groupId) return;

        await updateDoc(doc(db, "groups", groupId, "callList", id), {
            status,
            lastCallTimestamp: new Date()
        });

        if (status === "completed") {
            const call = callList.find(c => c.id === id);
            if (call) {
                await addDoc(collection(db, "groups", groupId, "activity"), {
                    userId: currentUser?.uid,
                    userName: currentUser?.displayName || currentUser?.email || "Unknown",
                    action: `Call to ${call.phoneNumber}`,
                    model: "twilio-call",
                    timestamp: new Date(),
                    cost: 0.05,
                    audioSeconds: 0,
                });
            }
        }
    };

    const deleteNumber = async (id: string) => {
        if (!groupId) return;
        await deleteDoc(doc(db, "groups", groupId, "callList", id));
    };

    const updateAssignedNumber = async () => {
        if (!groupId) return;
        await updateDoc(doc(db, "groups", groupId), {
            assignedNumber,
        });
        alert("Assigned number updated ✅");
    };

    const startCall = async (id: string, phoneNumber: string) => {
        try {
            // Mark as "calling"
            await updateStatus(id, "calling");

            // Trigger Twilio call
            const res = await fetch("/api/twilio/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: phoneNumber,
                    userId: currentUser?.uid,
                }),
            });

            const data = await res.json();

            if (res.ok && data.callSid) {
                console.log("✅ Call started successfully", data.callSid);

                // Store callSid and update to "ringing"
                if (!groupId) throw new Error("Group ID is null");
                await updateDoc(doc(db, "groups", groupId, "callList", id), {
                    status: "ringing",
                    callSid: data.callSid,
                });
            } else {
                console.error("❌ Error starting call:", data.error);
                alert(`Error: ${data.error}`);
                await updateStatus(id, "failed");
            }
        } catch (err) {
            console.error("Call error:", err);
            await updateStatus(id, "failed");
        }
    };

    const getStatusBadge = (status: string) => {
        const badges: Record<string, string> = {
            pending: "bg-gray-200 text-gray-700",
            calling: "bg-blue-200 text-blue-700 animate-pulse",
            ringing: "bg-yellow-200 text-yellow-700 animate-pulse",
            "in-progress": "bg-purple-200 text-purple-700",
            completed: "bg-green-200 text-green-700",
            failed: "bg-red-200 text-red-700",
            busy: "bg-orange-200 text-orange-700",
            "no-answer": "bg-red-200 text-red-700",
        };
        return badges[status] || badges.pending;
    };

    const getStatusIcon = (status: string) => {
        const icons: Record<string, string> = {
            pending: "⏳",
            calling: "📲",
            ringing: "🔔",
            "in-progress": "📞",
            completed: "✅",
            failed: "❌",
            busy: "🚫",
            "no-answer": "📵",
        };
        return icons[status] || "⏳";
    };

    // 🔥 Filter calls
    const filteredCalls = callList.filter(entry => {
        if (filterStatus === "all") return true;
        return entry.status === filterStatus;
    });

    // 🔥 Stats
    const stats = {
        total: callList.length,
        pending: callList.filter(c => c.status === "pending").length,
        inProgress: callList.filter(c => ["calling", "ringing", "in-progress"].includes(c.status)).length,
        completed: callList.filter(c => c.status === "completed").length,
        failed: callList.filter(c => ["failed", "busy", "no-answer"].includes(c.status)).length,
    };

    return (
        <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-5">
                    <button
                        onClick={() => router.push("/")}
                        className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                    >
                        ← Back to Home
                    </button>
                    <h1 className="text-3xl font-bold">📞 Call List</h1>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold">{stats.total}</div>
                    <div className="text-sm text-gray-600">Total Calls</div>
                </div>
                <div className="bg-gray-100 p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-gray-700">{stats.pending}</div>
                    <div className="text-sm text-gray-600">⏳ Pending</div>
                </div>
                <div className="bg-blue-100 p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-blue-700">{stats.inProgress}</div>
                    <div className="text-sm text-blue-600">📞 In Progress</div>
                </div>
                <div className="bg-green-100 p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-green-700">{stats.completed}</div>
                    <div className="text-sm text-green-600">✅ Completed</div>
                </div>
                <div className="bg-red-100 p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
                    <div className="text-sm text-red-600">❌ Failed</div>
                </div>
            </div>

            {/* Assigned Number (Admin only) */}
            {isAdmin && !loadingGroupData && (
                <div className="mb-6 bg-white p-4 rounded-lg shadow">
                    <label className="block mb-2 font-medium text-gray-700">
                        Assigned Twilio Number
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            className="border rounded px-3 py-2 flex-1"
                            value={assignedNumber}
                            onChange={(e) => setAssignedNumber(e.target.value)}
                            placeholder="+1234567890"
                        />
                        <button
                            onClick={updateAssignedNumber}
                            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
                        >
                            💾 Save
                        </button>
                    </div>
                </div>
            )}

            {/* Add Number */}
            <div className="flex gap-2 mb-6">
                <input
                    type="text"
                    placeholder="Enter phone number (e.g., +1234567890)"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    className="border rounded px-3 py-2 flex-1"
                />
                <button
                    onClick={addNumber}
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-semibold"
                >
                    ➕ Add Number
                </button>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 mb-4">
                {["all", "pending", "calling", "ringing", "in-progress", "completed", "failed"].map(status => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-3 py-1 rounded text-sm ${filterStatus === status
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                    >
                        {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                ))}
            </div>

            {/* Call List Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-100 border-b">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold">Phone Number</th>
                            <th className="px-4 py-3 text-left font-semibold">Status</th>
                            <th className="px-4 py-3 text-left font-semibold">Call SID</th>
                            <th className="px-4 py-3 text-left font-semibold">Last Updated</th>
                            <th className="px-4 py-3 text-left font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCalls.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-500">
                                    No calls found
                                </td>
                            </tr>
                        ) : (
                            filteredCalls.map((entry) => (
                                <tr key={entry.id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono">{entry.phoneNumber}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${getStatusBadge(entry.status)}`}>
                                            {getStatusIcon(entry.status)} {entry.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                                        {entry.callSid ? entry.callSid.slice(-8) : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500">
                                        {entry.lastCallTimestamp
                                            ? new Date(entry.lastCallTimestamp.toDate()).toLocaleString()
                                            : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            {isAdmin && (
                                                <button
                                                    onClick={() => deleteNumber(entry.id)}
                                                    className="text-red-600 hover:text-red-800 text-sm font-semibold"
                                                >
                                                    🗑️ Delete
                                                </button>
                                            )}
                                            {entry.status === "pending" && (
                                                <button
                                                    onClick={() => startCall(entry.id, entry.phoneNumber)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                                                >
                                                    📞 Start Call
                                                </button>
                                            )}
                                            {entry.callSid && (
                                                <button
                                                    onClick={() => setSelectedCallId(entry.callSid!)}
                                                    className="text-green-600 hover:text-green-800 text-sm font-semibold"
                                                >
                                                    💬 View Transcript
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Transcript Modal */}
            {selectedCallId && (
                <TranscriptModal
                    callSid={selectedCallId}
                    onClose={() => setSelectedCallId(null)}
                />
            )}
        </div>
    );
};

// 🔥 Transcript Modal Component
function TranscriptModal({ callSid, onClose }: { callSid: string; onClose: () => void }) {
    const [transcript, setTranscript] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTranscript = async () => {
            try {
                // Find call document by callSid
                const callsRef = collection(db, "calls");
                const q = query(callsRef, where("callSid", "==", callSid));
                const callsSnapshot = await getDocs(q);

                if (callsSnapshot.empty) {
                    console.error("No call found with SID:", callSid);
                    setLoading(false);
                    return;
                }

                const callDoc = callsSnapshot.docs[0];
                const transcriptRef = collection(db, "calls", callDoc.id, "transcript");
                const transcriptSnapshot = await getDocs(transcriptRef);

                const messages = transcriptSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Sort by timestamp
                messages.sort((a: any, b: any) => {
                    if (!a.timestamp || !b.timestamp) return 0;
                    return a.timestamp.toMillis() - b.timestamp.toMillis();
                });

                setTranscript(messages);
                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch transcript:", err);
                setLoading(false);
            }
        };

        fetchTranscript();
    }, [callSid]);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Call Transcript</h2>
                        <p className="text-sm text-gray-500 font-mono">Call SID: {callSid.slice(-8)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                        ✕
                    </button>
                </div>

                {/* Transcript Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : transcript.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            No transcript available for this call.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {transcript.map((msg: any) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.speaker === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[75%] rounded-lg p-4 ${msg.speaker === "user"
                                                ? "bg-blue-600 text-white"
                                                : "bg-gray-200 text-gray-800"
                                            }`}
                                    >
                                        <div className="font-semibold text-sm mb-1 capitalize">
                                            {msg.speaker === "user" ? "Customer" : "AI Agent"}
                                        </div>
                                        <div className="text-sm">{msg.text}</div>
                                        <div className="text-xs opacity-70 mt-2">
                                            {msg.timestamp?.toDate
                                                ? msg.timestamp.toDate().toLocaleTimeString()
                                                : "--"}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t">
                    <button
                        onClick={onClose}
                        className="w-full bg-gray-800 text-white py-2 rounded-lg hover:bg-gray-900 font-semibold"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CallList;