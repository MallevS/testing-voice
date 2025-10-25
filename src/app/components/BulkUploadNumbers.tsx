// import React, { useState } from "react";
// import Papa from "papaparse";

// interface BulkUploadNumbersProps {
//   onClose?: () => void;
//   onCall?: (number: string) => Promise<void>;
// }

// export default function BulkUploadNumbers({ onClose, onCall }: BulkUploadNumbersProps) {
//   const [numbers, setNumbers] = useState<string[]>([]);
//   const [textInput, setTextInput] = useState("");

//   // 🧾 Parse pasted text
//   const parseText = () => {
//     const parsed = textInput
//       .split(/[\n,]+/)
//       .map((n) => n.trim())
//       .filter(Boolean);
//     setNumbers(parsed);
//   };

//   // 📂 Parse CSV upload
//   const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     Papa.parse(file, {
//       header: true,
//       complete: (results) => {
//         const parsed = results.data
//           .map((row: any) => row.phoneNumber?.trim())
//           .filter(Boolean);
//         setNumbers(parsed);
//       },
//     });
//   };

//   const handleStartCalls = async () => {
//     if (!onCall) return; // exit if no call function is provided

//     for (const number of numbers) {
//       try {
//         console.log("📞 Starting call to", number);
//         await onCall(number); // trigger the real call logic
//       } catch (err) {
//         console.error("❌ Failed to call", number, err);
//       }
//     }

//     if (onClose) onClose(); // close modal after all calls
//   };

//   return (
//     <div>
//       <p className="text-gray-600 mb-3 text-sm">
//         Paste numbers manually or upload a CSV file containing <b>phoneNumber</b> column.
//       </p>

//       <div className="flex flex-col gap-3">
//         <textarea
//           value={textInput}
//           onChange={(e) => setTextInput(e.target.value)}
//           placeholder="Paste numbers here (comma or newline separated)"
//           className="border border-gray-300 rounded-md p-3 h-32 text-sm resize-none text-black"
//         />
//         <div className="flex gap-2">
//           <button
//             onClick={parseText}
//             className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
//           >
//             Parse Text
//           </button>

//           <label className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md cursor-pointer hover:bg-gray-300 transition">
//             Upload CSV
//             <input
//               type="file"
//               accept=".csv"
//               onChange={handleFileUpload}
//               className="hidden"
//             />
//           </label>

//           <button
//             onClick={handleStartCalls}
//             disabled={numbers.length === 0}
//             className={`px-4 py-2 rounded-md text-white transition ${
//               numbers.length > 0
//                 ? "bg-green-600 hover:bg-green-700"
//                 : "bg-gray-400 cursor-not-allowed"
//             }`}
//           >
//             Start Calls ({numbers.length})
//           </button>
//         </div>
//       </div>

//       {numbers.length > 0 && (
//         <div className="mt-4 border-t pt-2">
//           <h3 className="font-semibold text-gray-800 mb-1">
//             Parsed Numbers ({numbers.length})
//           </h3>
//           <ul className="text-sm text-gray-700 max-h-40 overflow-auto list-disc pl-6">
//             {numbers.map((num, i) => (
//               <li key={i}>{num}</li>
//             ))}
//           </ul>
//         </div>
//       )}
//     </div>
//   );
// }
import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { collection, addDoc, updateDoc, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/app/firebaseConfig";

interface BulkUploadNumbersProps {
  onClose?: () => void;
  onCall?: (number: string) => Promise<string>; // Returns call SID
}

interface CallStatus {
  number: string;
  status: 'pending' | 'calling' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
  error?: string;
  callSid?: string;
  firestoreId?: string; // Track Firestore document ID
}

export default function BulkUploadNumbers({ onClose, onCall }: BulkUploadNumbersProps) {
  const [numbers, setNumbers] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [callStatuses, setCallStatuses] = useState<CallStatus[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);

  // 🔥 Get user's groupId on mount
  useEffect(() => {
    const fetchGroupId = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userSnap.data();
      if (userData?.groupId) {
        setGroupId(userData.groupId);
      }
    };

    fetchGroupId();
  }, []);

  // 🧾 Parse pasted text
  const parseText = () => {
    const parsed = textInput
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    setNumbers(parsed);
    setCallStatuses(parsed.map(num => ({ number: num, status: 'pending' })));
  };

  // 📂 Parse CSV upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const parsed = results.data
          .map((row: any) => row.phoneNumber?.trim())
          .filter(Boolean);
        setNumbers(parsed);
        setCallStatuses(parsed.map(num => ({ number: num, status: 'pending' })));
      },
    });
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 🔥 Save number to Firebase call list
  const saveToCallList = async (phoneNumber: string): Promise<string | null> => {
    if (!groupId || !auth.currentUser) return null;

    try {
      const docRef = await addDoc(collection(db, "groups", groupId, "callList"), {
        phoneNumber,
        status: "pending",
        addedBy: auth.currentUser.uid,
        calledBy: null,
        lastCallTimestamp: null,
        callSid: null,
      });

      console.log(`✅ Saved ${phoneNumber} to call list with ID: ${docRef.id}`);
      return docRef.id;
    } catch (err) {
      console.error("Failed to save to call list:", err);
      return null;
    }
  };

  // 🔥 Update call status in Firebase
  const updateFirestoreStatus = async (
    firestoreId: string,
    status: string,
    callSid?: string
  ) => {
    if (!groupId) return;

    try {
      const updateData: any = { status };
      if (callSid) updateData.callSid = callSid;
      if (status === "completed" || status === "failed") {
        updateData.lastCallTimestamp = new Date();
      }

      await updateDoc(doc(db, "groups", groupId, "callList", firestoreId), updateData);
      console.log(`✅ Updated Firestore status to: ${status}`);
    } catch (err) {
      console.error("Failed to update Firestore:", err);
    }
  };

  // 🔥 Log call to activity collection
  const logCallActivity = async (phoneNumber: string, status: string) => {
    if (!groupId || !auth.currentUser) return;

    try {
      await addDoc(collection(db, "groups", groupId, "activity"), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || "Unknown",
        action: `Call to ${phoneNumber}`,
        model: "twilio-call",
        timestamp: new Date(),
        cost: 0.05, // Adjust based on actual call cost
        audioSeconds: 0,
        phoneNumber: phoneNumber,
        status: status,
      });
      console.log(`✅ Logged activity for ${phoneNumber}`);
    } catch (err) {
      console.error("Failed to log activity:", err);
    }
  };

  // 🔥 Poll Twilio for call status
  const pollCallStatus = async (callSid: string): Promise<string> => {
    const maxAttempts = 180; // 3 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const res = await fetch(`/api/twilio/call-status?callSid=${callSid}`);
        if (!res.ok) throw new Error("Failed to fetch call status");

        const data = await res.json();
        const status = data.status;

        console.log(`📊 Call ${callSid} status: ${status}`);

        // Terminal statuses
        if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
          return status;
        }

        await sleep(1000);
        attempts++;
      } catch (err) {
        console.error(`❌ Error polling status:`, err);
        await sleep(1000);
        attempts++;
      }
    }

    return 'failed'; // Timeout
  };

  const handleStartCalls = async () => {
    if (!onCall || isCalling || !groupId) {
      if (!groupId) alert("❌ Unable to access your group. Please try logging out and back in.");
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert("❌ You must be logged in to make calls");
      return;
    }

    setIsCalling(true);

    for (let i = 0; i < numbers.length; i++) {
      const number = numbers[i];

      // 1️⃣ Save to Firebase call list first
      const firestoreId = await saveToCallList(number);

      if (!firestoreId) {
        console.error(`❌ Failed to save ${number} to call list`);
        setCallStatuses(prev =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'failed', error: 'Failed to save to database' } : s
          )
        );
        continue;
      }

      // Store Firestore ID in state
      setCallStatuses(prev =>
        prev.map((s, idx) =>
          idx === i ? { ...s, firestoreId } : s
        )
      );

      // 2️⃣ Update status to "calling"
      setCallStatuses(prev =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: 'calling' } : s
        )
      );

      try {
        console.log(`📞 [${i + 1}/${numbers.length}] Initiating call to ${number}...`);

        // 3️⃣ Initiate call and get SID
        const callSid = await onCall(number);

        // 4️⃣ Update both local state and Firestore
        setCallStatuses(prev =>
          prev.map((s, idx) =>
            idx === i ? { ...s, callSid, status: 'ringing' } : s
          )
        );

        await updateFirestoreStatus(firestoreId, 'ringing', callSid);

        console.log(`✅ Call initiated with SID: ${callSid}`);

        // 5️⃣ Poll and update status in real-time
        let lastStatus = 'ringing';
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`/api/twilio/call-status?callSid=${callSid}`);
            const data = await res.json();
            const currentStatus = data.status;

            if (currentStatus !== lastStatus) {
              lastStatus = currentStatus;

              // Update local UI
              setCallStatuses(prev =>
                prev.map((s, idx) =>
                  idx === i ? { ...s, status: currentStatus as any } : s
                )
              );

              // Update Firestore
              await updateFirestoreStatus(firestoreId, currentStatus);
            }
          } catch (err) {
            console.error("Error in status update:", err);
          }
        }, 2000);

        // 6️⃣ Wait for terminal status
        const finalStatus = await pollCallStatus(callSid);
        clearInterval(pollInterval);

        // 7️⃣ Update final status everywhere
        const mappedStatus = finalStatus === 'completed' ? 'completed' : 'failed';

        setCallStatuses(prev =>
          prev.map((s, idx) =>
            idx === i ? {
              ...s,
              status: mappedStatus,
              error: finalStatus !== 'completed' ? finalStatus : undefined
            } : s
          )
        );

        await updateFirestoreStatus(firestoreId, mappedStatus);
        if (mappedStatus === 'completed') {
          await logCallActivity(number, mappedStatus);
        }

        console.log(`✅ [${i + 1}/${numbers.length}] Call to ${number} ${finalStatus}`);

        // Small delay before next call
        if (i < numbers.length - 1) {
          console.log(`⏳ Waiting 2 seconds before next call...`);
          await sleep(2000);
        }

      } catch (err: any) {
        console.error(`❌ [${i + 1}/${numbers.length}] Failed to call ${number}:`, err);

        setCallStatuses(prev =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'failed', error: err.message } : s
          )
        );

        await updateFirestoreStatus(firestoreId, 'failed');
      }
    }

    setIsCalling(false);
    console.log("✅ All calls completed and saved to call list!");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-500';
      case 'calling': return 'text-blue-600 font-semibold';
      case 'ringing': return 'text-yellow-600 font-semibold';
      case 'in-progress': return 'text-purple-600 font-semibold';
      case 'completed': return 'text-green-600';
      case 'failed':
      case 'busy':
      case 'no-answer': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'calling': return '📲';
      case 'ringing': return '🔔';
      case 'in-progress': return '📞';
      case 'completed': return '✅';
      case 'failed':
      case 'busy':
      case 'no-answer': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div>
      <p className="text-gray-600 mb-3 text-sm">
        Paste numbers manually or upload a CSV file containing <b>phoneNumber</b> column.
      </p>

      {!groupId && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
          ⚠️ Unable to access your group. Please refresh or log in again.
        </div>
      )}

      <div className="flex flex-col gap-3">
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Paste numbers here (comma or newline separated)"
          className="border border-gray-300 rounded-md p-3 h-32 text-sm resize-none text-black"
          disabled={isCalling}
        />

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={parseText}
              disabled={isCalling}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              Parse Text
            </button>

            <label className={`bg-gray-200 text-gray-700 px-4 py-2 rounded-md transition ${isCalling ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-300'}`}>
              Upload CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isCalling}
              />
            </label>
          </div>

          <button
            onClick={handleStartCalls}
            disabled={numbers.length === 0 || isCalling || !groupId}
            className={`px-4 py-2 rounded-md text-white transition ${numbers.length > 0 && !isCalling && groupId
                ? "bg-green-600 hover:bg-green-700"
                : "bg-gray-400 cursor-not-allowed"
              }`}
          >
            {isCalling ? '📞 Calling...' : `Start Sequential Calls (${numbers.length})`}
          </button>

          <p className="text-xs text-gray-500">
            ℹ️ Each call will be saved to your call list and wait for completion before starting the next one.
          </p>
        </div>
      </div>

      {/* Call Status Display */}
      {callStatuses.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="font-semibold text-gray-800 mb-2">
            Call Progress ({callStatuses.filter(s => s.status === 'completed').length}/{callStatuses.length} completed)
          </h3>
          <div className="max-h-64 overflow-auto">
            <ul className="text-sm space-y-1">
              {callStatuses.map((status, i) => (
                <li key={i} className={`flex items-center gap-2 ${getStatusColor(status.status)}`}>
                  <span className="text-base">{getStatusIcon(status.status)}</span>
                  <span className="font-mono">{status.number}</span>
                  <span className="text-xs uppercase">{status.status}</span>
                  {status.callSid && (
                    <span className="text-xs text-gray-400">({status.callSid.slice(-6)})</span>
                  )}
                  {status.firestoreId && (
                    <span className="text-xs text-green-500">💾</span>
                  )}
                  {status.error && (
                    <span className="text-xs text-red-500">({status.error})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}