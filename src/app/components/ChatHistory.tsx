"use client";

import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { query, orderBy } from "firebase/firestore";
interface TranscriptMessage {
  id: string;
  speaker: string;
  text: string;
  timestamp: any;
}

interface Chat {
  id: string;
  timestamp: any;
  transcript: TranscriptMessage[];
}

function ChatHistory({ onClose }: { onClose: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);

  useEffect(() => {
    const fetchChats = async () => {
      const callsCollection = collection(db, "calls");
      const q = query(callsCollection, orderBy("timestamp", "desc"));
      const callsSnapshot = await getDocs(q);

      const chatList: Chat[] = await Promise.all(
        callsSnapshot.docs.map(async (callDoc) => {
          const transcriptCollection = collection(
            db,
            "calls",
            callDoc.id,
            "transcript"
          );
          const transcriptSnapshot = await getDocs(transcriptCollection);
          const transcript: TranscriptMessage[] = transcriptSnapshot.docs.map(
            (tDoc) => {
              const tData = tDoc.data();
              return {
                id: tDoc.id,
                speaker: tData.speaker,
                text: tData.text,
                timestamp: tData.timestamp,
              };
            }
          );
          return {
            id: callDoc.id,
            timestamp: callDoc.data().timestamp,
            transcript,
          };
        })
      );

      setChats(chatList);
    };

    fetchChats();
  }, []);

  if (selectedChat) {
    return (
      <div className="p-6  shadow-lg text-white min-h-screen mx-auto">
        <button
          onClick={() => setSelectedChat(null)}
          className="mb-6 inline-block text-indigo-300 hover:text-black transition underline font-semibold"
        >
          ← Back to Chat List
        </button>

        <h2 className="text-2xl text-black font-extrabold tracking-wide mb-2">
          Call ID: <span className="font-mono">{selectedChat.id}</span>
        </h2>
        <div className="mb-4 text-black">
          Call timestamp:{" "}
          {selectedChat.timestamp && selectedChat.timestamp.toDate
            ? selectedChat.timestamp.toDate().toLocaleString()
            : "--"}
        </div>

        <div className="overflow-auto max-h-[60vh] space-y-4 pr-2 flex flex-col">
          {Array.isArray(selectedChat.transcript) && selectedChat.transcript.length > 0 ? (
            selectedChat.transcript.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[75%] p-4 rounded-xl shadow-md flex flex-col ${msg.speaker.toLowerCase() === "user"
                    ? "bg-indigo-600 text-white self-end justify-end"
                    : "bg-indigo-300 text-indigo-900 self-start justify-start"
                  }`}
              >
                <div className="font-semibold mb-1 capitalize">{msg.speaker}</div>
                <div>{msg.text}</div>
                <div className="mt-2 text-xs opacity-70">
                  {msg.timestamp && msg.timestamp.toDate
                    ? msg.timestamp.toDate().toLocaleString()
                    : "--"}
                </div>
              </div>
            ))
          ) : (
            <div className="text-indigo-300 italic">No transcript messages found for this call.</div>
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="p-6 mx-auto bg-gradient-to-br from-gray-200 via-gray-100 to-indigo-100 rounded-3xl shadow-xl">
      <button onClick={onClose} className="mb-6 text-indigo-600 hover:text-indigo-900 underline font-semibold">
        ← Go Back
      </button>
      <h2 className="text-3xl font-bold mb-6 text-indigo-900">Chat History</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {chats.map((chat) => (
          <li
            key={chat.id}
            onClick={() => setSelectedChat(chat)}
            className="cursor-pointer rounded-2xl p-6 bg-white shadow-md border border-indigo-300 hover:ring-2 hover:ring-indigo-500 transition flex flex-col justify-between"
          >
            <div className="text-indigo-800 font-semibold text-lg truncate mb-2">Call ID: <span className="font-mono">{chat.id}</span></div>
            <div className="text-indigo-600 text-sm">
              {chat.timestamp && chat.timestamp.toDate
                ? chat.timestamp.toDate().toLocaleString()
                : "--"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ChatHistory;
