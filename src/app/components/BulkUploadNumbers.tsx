import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { collection, addDoc, updateDoc, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/app/firebaseConfig";

interface BulkUploadNumbersProps {
  onClose?: () => void;
  onCall?: (number: string, customerName?: string, customerEmail?: string) => Promise<string>;
}

interface ContactInfo {
  phoneNumber: string;
  customerName?: string;
  customerEmail?: string;
  status: 'saved' | 'pending' | 'calling' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
  error?: string;
  callSid?: string;
  firestoreId?: string;
}

export default function BulkUploadNumbers({ onClose, onCall }: BulkUploadNumbersProps) {
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'upload' | 'saved'>('upload');

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
    const lines = textInput.split('\n').filter(line => line.trim());
    const parsed: ContactInfo[] = [];

    lines.forEach(line => {
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length >= 1) {
        parsed.push({
          phoneNumber: parts[0],
          customerName: parts[1] || undefined,
          customerEmail: parts[2] || undefined,
          status: 'saved'
        });
      }
    });

    setContacts(parsed);
    setViewMode('saved');
  };

  // 📂 Parse CSV upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const parsed: ContactInfo[] = results.data
          .filter((row: any) => row.phoneNumber?.trim())
          .map((row: any) => ({
            phoneNumber: row.phoneNumber?.trim(),
            customerName: row.customerName?.trim() || row.name?.trim() || undefined,
            customerEmail: row.customerEmail?.trim() || row.email?.trim() || undefined,
            status: 'saved' as const
          }));
        
        setContacts(parsed);
        setViewMode('saved');
      },
    });
  };

  const handleSaveContacts = async () => {
    if (!groupId || !auth.currentUser || contacts.length === 0) return;

    setIsSaving(true);

    try {
      const savePromises = contacts.map(async (contact) => {
        const docRef = await addDoc(collection(db, "groups", groupId, "callList"), {
          phoneNumber: contact.phoneNumber,
          customerName: contact.customerName || null,
          customerEmail: contact.customerEmail || null,
          status: "pending",
          addedBy: auth.currentUser!.uid,
          calledBy: null,
          lastCallTimestamp: null,
          callSid: null,
        });

        return { ...contact, firestoreId: docRef.id };
      });

      const savedContacts = await Promise.all(savePromises);
      
      setContacts(savedContacts);
      alert(`✅ Successfully saved ${savedContacts.length} contacts to call list!`);
      console.log("✅ All contacts saved to Firebase");
    } catch (err) {
      console.error("Failed to save contacts:", err);
      alert("❌ Failed to save some contacts. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const pollCallStatus = async (callSid: string): Promise<string> => {
    const maxAttempts = 180;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const res = await fetch(`/api/twilio/call-status?callSid=${callSid}`);
        if (!res.ok) throw new Error("Failed to fetch call status");

        const data = await res.json();
        const status = data.status;

        if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
          return status;
        }

        await sleep(2000);
        attempts++;
      } catch (err) {
        console.error(`❌ Error polling status:`, err);
        await sleep(2000);
        attempts++;
      }
    }

    return 'failed';
  };
  const handleCallSelected = async () => {
    if (!onCall || isCalling || !groupId || selectedContacts.size === 0) return;

    setIsCalling(true);

    const selectedIndexes = Array.from(selectedContacts).sort((a, b) => a - b);

    for (const idx of selectedIndexes) {
      const contact = contacts[idx];

      setContacts(prev =>
        prev.map((c, i) => i === idx ? { ...c, status: 'calling' } : c)
      );

      try {
        console.log(`📞 Calling ${contact.phoneNumber}...`);
        
        const callSid = await onCall(
          contact.phoneNumber,
          contact.customerName,
          contact.customerEmail
        );

        setContacts(prev =>
          prev.map((c, i) =>
            i === idx ? { ...c, callSid, status: 'ringing' } : c
          )
        );

        if (contact.firestoreId) {
          await updateFirestoreStatus(contact.firestoreId, 'ringing', callSid);
        }

        // Poll for status updates
        let lastStatus = 'ringing';
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`/api/twilio/call-status?callSid=${callSid}`);
            const data = await res.json();
            const currentStatus = data.status;

            if (currentStatus !== lastStatus) {
              lastStatus = currentStatus;

              setContacts(prev =>
                prev.map((c, i) =>
                  i === idx ? { ...c, status: currentStatus as any } : c
                )
              );

              if (contact.firestoreId) {
                await updateFirestoreStatus(contact.firestoreId, currentStatus);
              }
            }
          } catch (err) {
            console.error("Error in status update:", err);
          }
        }, 2000);

        const finalStatus = await pollCallStatus(callSid);
        clearInterval(pollInterval);

        const mappedStatus = finalStatus === 'completed' ? 'completed' : 'failed';

        setContacts(prev =>
          prev.map((c, i) =>
            i === idx ? {
              ...c,
              status: mappedStatus,
              error: finalStatus !== 'completed' ? finalStatus : undefined
            } : c
          )
        );

        if (contact.firestoreId) {
          await updateFirestoreStatus(contact.firestoreId, mappedStatus);
        }

        console.log(`✅ Call to ${contact.phoneNumber} ${finalStatus}`);

        await sleep(2000);

      } catch (err: any) {
        console.error(`❌ Failed to call ${contact.phoneNumber}:`, err);
        setContacts(prev =>
          prev.map((c, i) =>
            i === idx ? { ...c, status: 'failed', error: err.message } : c
          )
        );
      }
    }

    setIsCalling(false);
    setSelectedContacts(new Set());
    console.log("✅ All selected calls completed!");
  };

  const toggleSelectContact = (idx: number) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map((_, i) => i)));
    }
  };

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

  // const handleStartCalls = async () => {
  //   if (!onCall || isCalling || !groupId) {
  //     if (!groupId) alert("❌ Unable to access your group. Please try logging out and back in.");
  //     return;
  //   }

  //   const currentUser = auth.currentUser;
  //   if (!currentUser) {
  //     alert("❌ You must be logged in to make calls");
  //     return;
  //   }

  //   setIsCalling(true);

  //   for (let i = 0; i < numbers.length; i++) {
  //     const number = numbers[i];

  //     // 1️⃣ Save to Firebase call list first
  //     const firestoreId = await saveToCallList(number);

  //     if (!firestoreId) {
  //       console.error(`❌ Failed to save ${number} to call list`);
  //       setCallStatuses(prev =>
  //         prev.map((s, idx) =>
  //           idx === i ? { ...s, status: 'failed', error: 'Failed to save to database' } : s
  //         )
  //       );
  //       continue;
  //     }

  //     // Store Firestore ID in state
  //     setCallStatuses(prev =>
  //       prev.map((s, idx) =>
  //         idx === i ? { ...s, firestoreId } : s
  //       )
  //     );

  //     // 2️⃣ Update status to "calling"
  //     setCallStatuses(prev =>
  //       prev.map((s, idx) =>
  //         idx === i ? { ...s, status: 'calling' } : s
  //       )
  //     );

  //     try {
  //       console.log(`📞 [${i + 1}/${numbers.length}] Initiating call to ${number}...`);

  //       // 3️⃣ Initiate call and get SID
  //       const callSid = await onCall(number);

  //       // 4️⃣ Update both local state and Firestore
  //       setCallStatuses(prev =>
  //         prev.map((s, idx) =>
  //           idx === i ? { ...s, callSid, status: 'ringing' } : s
  //         )
  //       );

  //       await updateFirestoreStatus(firestoreId, 'ringing', callSid);

  //       console.log(`✅ Call initiated with SID: ${callSid}`);

  //       // 5️⃣ Poll and update status in real-time
  //       let lastStatus = 'ringing';
  //       const pollInterval = setInterval(async () => {
  //         try {
  //           const res = await fetch(`/api/twilio/call-status?callSid=${callSid}`);
  //           const data = await res.json();
  //           const currentStatus = data.status;

  //           if (currentStatus !== lastStatus) {
  //             lastStatus = currentStatus;

  //             // Update local UI
  //             setCallStatuses(prev =>
  //               prev.map((s, idx) =>
  //                 idx === i ? { ...s, status: currentStatus as any } : s
  //               )
  //             );

  //             // Update Firestore
  //             await updateFirestoreStatus(firestoreId, currentStatus);
  //           }
  //         } catch (err) {
  //           console.error("Error in status update:", err);
  //         }
  //       }, 2000);

  //       // 6️⃣ Wait for terminal status
  //       const finalStatus = await pollCallStatus(callSid);
  //       clearInterval(pollInterval);

  //       // 7️⃣ Update final status everywhere
  //       const mappedStatus = finalStatus === 'completed' ? 'completed' : 'failed';

  //       setCallStatuses(prev =>
  //         prev.map((s, idx) =>
  //           idx === i ? {
  //             ...s,
  //             status: mappedStatus,
  //             error: finalStatus !== 'completed' ? finalStatus : undefined
  //           } : s
  //         )
  //       );

  //       await updateFirestoreStatus(firestoreId, mappedStatus);
  //       if (mappedStatus === 'completed') {
  //         await logCallActivity(number, mappedStatus);
  //       }

  //       console.log(`✅ [${i + 1}/${numbers.length}] Call to ${number} ${finalStatus}`);

  //       // Small delay before next call
  //       if (i < numbers.length - 1) {
  //         console.log(`⏳ Waiting 2 seconds before next call...`);
  //         await sleep(2000);
  //       }

  //     } catch (err: any) {
  //       console.error(`❌ [${i + 1}/${numbers.length}] Failed to call ${number}:`, err);

  //       setCallStatuses(prev =>
  //         prev.map((s, idx) =>
  //           idx === i ? { ...s, status: 'failed', error: err.message } : s
  //         )
  //       );

  //       await updateFirestoreStatus(firestoreId, 'failed');
  //     }
  //   }

  //   setIsCalling(false);
  //   console.log("✅ All calls completed and saved to call list!");
  // };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'saved': return 'text-blue-600';
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
      case 'saved': return '💾';
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
      {viewMode === 'upload' ? (
        <>
          <p className="text-gray-600 mb-3 text-sm">
            <strong>Format:</strong> phoneNumber, customerName, customerEmail (one per line)
            <br />
            <strong>Example:</strong> +1234567890, John Doe, john@example.com
          </p>

          <div className="flex flex-col gap-3">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="+1234567890, John Doe, john@example.com&#10;+0987654321, Jane Smith, jane@example.com"
              className="border border-gray-300 rounded-md p-3 h-40 text-sm resize-none text-black font-mono"
              disabled={isSaving}
            />

            <div className="flex gap-2">
              <button
                onClick={parseText}
                disabled={isSaving || !textInput.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
              >
                📋 Parse Text
              </button>

              <label className={`bg-gray-200 text-gray-700 px-4 py-2 rounded-md transition ${isSaving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-300'}`}>
                📂 Upload CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isSaving}
                />
              </label>
            </div>

            <p className="text-xs text-gray-500">
              ℹ️ CSV should have columns: <code>phoneNumber</code>, <code>customerName</code>, <code>customerEmail</code>
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">
              Contacts ({contacts.length}) - {selectedContacts.size} selected
            </h3>
            <button
              onClick={() => setViewMode('upload')}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Upload
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleSaveContacts}
              disabled={isSaving || contacts.some(c => c.firestoreId)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition disabled:bg-gray-400"
            >
              {isSaving ? '💾 Saving...' : '💾 Save to Call List'}
            </button>

            <button
              onClick={handleCallSelected}
              disabled={isCalling || selectedContacts.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {isCalling ? '📞 Calling...' : `📞 Call Selected (${selectedContacts.size})`}
            </button>

            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
            >
              {selectedContacts.size === contacts.length ? '☐ Deselect All' : '☑ Select All'}
            </button>
          </div>

          <div className="max-h-96 overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left text-black">☑</th>
                  <th className="px-2 py-2 text-left text-black">Phone</th>
                  <th className="px-2 py-2 text-left text-black">Name</th>
                  <th className="px-2 py-2 text-left text-black">Email</th>
                  <th className="px-2 py-2 text-left text-black">Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-2 text-black">
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(idx)}
                        onChange={() => toggleSelectContact(idx)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-black">{contact.phoneNumber}</td>
                    <td className="px-2 py-2 text-black">{contact.customerName || '—'}</td>
                    <td className="px-2 py-2 text-xs text-black">{contact.customerEmail || '—'}</td>
                    <td className={`px-2 py-2 ${getStatusColor(contact.status)}`}>
                      {getStatusIcon(contact.status)} {contact.status}
                      {contact.error && (
                        <span className="text-xs text-red-500 ml-1">({contact.error})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}