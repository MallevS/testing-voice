"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import Transcript from "./components/Transcript";
import Events from "./components/Events";
import BottomToolbar from "./components/BottomToolbar";
import { SessionStatus } from "@/app/types";
import type { RealtimeAgent } from '@openai/agents/realtime';
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useRealtimeSession } from "./hooks/useRealtimeSession";
import { createModerationGuardrail } from "@/app/agentConfigs/guardrails";
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import { createCustomerServiceScenario } from "@/app/agentConfigs/customerServiceRetail";
import Link from "next/link";
import useAudioDownload from "./hooks/useAudioDownload";
import { useHandleSessionHistory } from "./hooks/useHandleSessionHistory";
import { collection, setDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../app/firebaseConfig";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import Header from "./components/Header";

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

function App() {
  const searchParams = useSearchParams()!;
  const [companyName, setCompanyName] = useState<string>('');
  const [companyContext, setCompanyContext] = useState<string>('');
  const [useCustomCompany, setUseCustomCompany] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);

  useEffect(() => {
    const listener = async () => {
      setShowInsufficientCreditsModal(true);
  
      // Stop ongoing session
      try {
        await disconnectFromRealtime();
      } catch (err) {
        console.error("Failed to disconnect on insufficient credits:", err);
      }
  
      // Mute SDK audio
      try {
        mute(true);
      } catch {}
      
      setUserText(""); // Clear input
      setIsPTTUserSpeaking(false);
    };
  
    window.addEventListener("insufficientCredits", listener);
    return () => window.removeEventListener("insufficientCredits", listener);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setUserRole(snap.data().role);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
    customerServiceRetail: createCustomerServiceScenario(companyName.trim(), companyContext.trim()),
  };

  const urlCodec = searchParams.get("codec") || "opus";

  const {
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    transcriptItems
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    RealtimeAgent[] | null
  >(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const handoffTriggeredRef = useRef(false);

  const sdkAudioElement = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }, []);

  useEffect(() => {
    if (sdkAudioElement && !audioElementRef.current) {
      audioElementRef.current = sdkAudioElement;
    }
  }, [sdkAudioElement]);

  const {
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    interrupt,
    mute,
  } = useRealtimeSession({
    onConnectionChange: (s) => setSessionStatus(s as SessionStatus),
    onAgentHandoff: (agentName: string) => {
      handoffTriggeredRef.current = true;
      setSelectedAgentName(agentName);
    },
  });

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return true;
      const stored = localStorage.getItem('audioPlaybackEnabled');
      return stored ? stored === 'true' : true;
    },
  );

  const { startRecording, stopRecording, downloadRecording } = useAudioDownload();

  async function saveCallTranscript(transcript: TranscriptMessage[], callId?: string): Promise<string> {
    const callsRef = collection(db, "calls");
    const callDocRef = callId ? doc(db, "calls", callId) : doc(callsRef);

    const currentUser = auth.currentUser;

    await setDoc(callDocRef, {
      userId: currentUser?.uid,
      timestamp: serverTimestamp(),
    });

    const transcriptRef = collection(db, "calls", callDocRef.id, "transcript");

    const savePromises = transcript.map((msg) =>
      setDoc(doc(transcriptRef, msg.id), {
        speaker: msg.speaker,
        text: msg.text,
        timestamp: msg.timestamp || serverTimestamp(),
      })
    );
    await Promise.all(savePromises);

    return callDocRef.id;
  }

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    try {
      sendEvent(eventObj);
      logClientEvent(eventObj, eventNameSuffix);
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }
  };

  useHandleSessionHistory();

  // useEffect(() => {
  //   let finalAgentConfig = searchParams.get("agentConfig");
  //   if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
  //     finalAgentConfig = defaultAgentSetKey;
  //     const url = new URL(window.location.toString());
  //     url.searchParams.set("agentConfig", finalAgentConfig);
  //     window.location.replace(url.toString());
  //     return;
  //   }

  //   const agents = allAgentSets[finalAgentConfig];
  //   const agentKeyToUse = agents[0]?.name || "";

  //   setSelectedAgentName(agentKeyToUse);
  //   setSelectedAgentConfigSet(agents);
  // }, [searchParams]);
  useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");

    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
    }

    const agents = allAgentSets[finalAgentConfig];
    const agentKeyToUse = agents[0]?.name || "";

    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, [searchParams]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Agent: ${selectedAgentName}`, currentAgent);
      updateSession(!handoffTriggeredRef.current);
      handoffTriggeredRef.current = false;
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession();
    }
  }, [isPTTActive]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const MINIMUM_CREDITS_REQUIRED = 5; // $5 minimum to start

  const connectToRealtime = async () => {
    const agentSetKey = searchParams.get("agentConfig") || "default";
  
    let agentsToUse: RealtimeAgent[];
    let companyNameToUse: RealtimeAgent[];
  
    if (useCustomCompany && companyName.trim()) {
      agentsToUse = createCustomerServiceScenario(companyName.trim(), companyContext.trim());
      companyNameToUse = createCustomerServiceScenario(companyName.trim(), companyContext.trim());
    } else if (sdkScenarioMap[agentSetKey]) {
      agentsToUse = sdkScenarioMap[agentSetKey];
      companyNameToUse = createCustomerServiceScenario(companyName.trim(), companyContext.trim());
    } else {
      return;
    }
  
    if (sessionStatus !== "DISCONNECTED") return;
    setSessionStatus("CONNECTING");
  
    try {
      const user = auth.currentUser;
      if (!user) return;
  
      // Check group credits first with minimum requirement
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists) throw new Error("User not found");
  
      const userData = userSnap.data();
      if (!userData?.groupId) throw new Error("User not in group");
  
      const groupSnap = await getDoc(doc(db, "groups", userData.groupId));
      if (!groupSnap.exists) throw new Error("Group not found");
  
      const groupData = groupSnap.data();
      const currentCredits = groupData?.credits ?? 0;
  
      if (currentCredits < MINIMUM_CREDITS_REQUIRED) {
        setShowInsufficientCreditsModal(true);
        setSessionStatus("DISCONNECTED"); // Prevent connecting
        return; // Stop the session before it starts
      }
  
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) return;
  
      const reorderedAgents = [...agentsToUse];
      const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
      if (idx > 0) {
        const [agent] = reorderedAgents.splice(idx, 1);
        reorderedAgents.unshift(agent);
      }
  
      const guardrail = createModerationGuardrail(companyName.trim());
  
      await connect({
        getEphemeralKey: async () => EPHEMERAL_KEY,
        initialAgents: reorderedAgents,
        audioElement: sdkAudioElement,
        outputGuardrails: [guardrail],
        extraContext: {
          addTranscriptBreadcrumb,
          onError: (err: any) => {
            if (err?.status === 402 || err?.message?.includes("Insufficient credits")) {
              setShowInsufficientCreditsModal(true);
              interrupt();
            }
          },
        },
      });
    } catch (err) {
      console.error("Error connecting via SDK:", err);
      setSessionStatus("DISCONNECTED");
    }
  };
  

  // const connectToRealtime = async () => {
  //   const agentSetKey = searchParams.get("agentConfig") || "default";

  //   let agentsToUse: RealtimeAgent[];
  //   let companyNameToUse: RealtimeAgent[];

  //   if (useCustomCompany && companyName.trim()) {
  //     agentsToUse = createCustomerServiceScenario(companyName.trim(), companyContext.trim());
  //     companyNameToUse = createCustomerServiceScenario(companyName.trim(), companyContext.trim());
  //   } else if (sdkScenarioMap[agentSetKey]) {
  //     agentsToUse = sdkScenarioMap[agentSetKey];
  //     companyNameToUse = createCustomerServiceScenario(companyName.trim(), companyContext.trim());
  //   } else {
  //     return;
  //   }

  //   if (sessionStatus !== "DISCONNECTED") return;
  //   setSessionStatus("CONNECTING");

  //   try {
  //     const user = auth.currentUser;
  //     if (!user) return;
  
  //     const enough = await hasEnoughCredits(user);
  //     if (!enough) {
  //       setShowInsufficientCreditsModal(true);
  //       setSessionStatus("DISCONNECTED"); // Reset session status
  //       return; // Stop the session before it starts
  //     }

  //     const EPHEMERAL_KEY = await fetchEphemeralKey();
  //     if (!EPHEMERAL_KEY) return;

  //     const reorderedAgents = [...agentsToUse];
  //     const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
  //     if (idx > 0) {
  //       const [agent] = reorderedAgents.splice(idx, 1);
  //       reorderedAgents.unshift(agent);
  //     }

  //     const guardrail = createModerationGuardrail(companyName.trim());

  //     await connect({
  //       getEphemeralKey: async () => EPHEMERAL_KEY,
  //       initialAgents: reorderedAgents,
  //       audioElement: sdkAudioElement,
  //       outputGuardrails: [guardrail],
  //       extraContext: {
  //         addTranscriptBreadcrumb,
  //         onError: (err: any) => {
  //           if (err?.status === 402 || err?.message?.includes("Insufficient credits")) {
  //             setShowInsufficientCreditsModal(true);
  //             interrupt();
  //           }
  //         },
  //       },
  //     });
  //   } catch (err) {
  //     console.error("Error connecting via SDK:", err);
  //     setSessionStatus("DISCONNECTED");
  //   }
  // };

  const disconnectFromRealtime = async () => {
    try {
      const currentTranscript: TranscriptMessage[] = transcriptItems
        .filter(item => item.type === "MESSAGE")
        .map(item => ({
          id: item.itemId,
          speaker: item.role === "assistant" ? "agent" : "user",
          text: item.title ?? "",
          timestamp: item.createdAtMs ? new Date(item.createdAtMs) : null,
        }));

      if (currentTranscript.length > 0) {
        await saveCallTranscript(currentTranscript);
      }
    } catch (error) {
      console.error("Failed to save transcript on disconnect:", error);
    }

    disconnect();
    setSessionStatus("DISCONNECTED");
    setIsPTTUserSpeaking(false);
  };

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);

    sendClientEvent({
      type: 'conversation.item.create',
      item: {
        id,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    sendClientEvent({ type: 'response.create' }, '(simulated user text message)');
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    const turnDetection = isPTTActive
      ? null
      : {
        type: 'server_vad',
        threshold: 0.9,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: true,
      };

    sendEvent({
      type: 'session.update',
      session: {
        turn_detection: turnDetection,
      },
    });

    if (shouldTriggerResponse) {
      sendSimulatedUserMessage('hi');
    }
    return;
  }

  async function hasEnoughCredits(user: User): Promise<boolean> {
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) return false;
  
      const userData = userSnap.data();
      if (!userData?.groupId) return false;
  
      const groupSnap = await getDoc(doc(db, "groups", userData.groupId));
      if (!groupSnap.exists()) return false;
  
      const groupData = groupSnap.data();
      return (groupData?.credits ?? 0) > 0;
    } catch (err) {
      console.error("Failed to check group credits:", err);
      return false;
    }
  }
  

  // const handleSendTextMessage = () => {
  //   if (!userText.trim()) return;
  //   interrupt();

  //   try {
  //     sendUserText(userText.trim());
  //   } catch (err) {
  //     console.error('Failed to send via SDK', err);
  //   }

  //   setUserText("");
  // };

  const handleSendTextMessage = async () => {
    if (!userText.trim()) return;
  
    interrupt();
  
    try {
      await sendUserText(userText.trim()); // <-- make sure this is async
    } catch (err: any) {
      console.error('Failed to send via SDK', err);
      if (err?.status === 402 || err?.message?.includes("Insufficient credits")) {
        setShowInsufficientCreditsModal(true);
      }
    }
  
    setUserText("");
  };
  

  const handleTalkButtonDown = () => {
    if (sessionStatus !== 'CONNECTED') return;
    interrupt();

    setIsPTTUserSpeaking(true);
    sendClientEvent({ type: 'input_audio_buffer.clear' }, 'clear PTT buffer');
  };

  const handleTalkButtonUp = () => {
    if (sessionStatus !== 'CONNECTED' || !isPTTUserSpeaking)
      return;

    setIsPTTUserSpeaking(false);
    sendClientEvent({ type: 'input_audio_buffer.commit' }, 'commit PTT');
    sendClientEvent({ type: 'response.create' }, 'trigger response PTT');
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setSessionStatus("DISCONNECTED");
    } else {
      connectToRealtime();
    }
  };

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAgentConfig = e.target.value;
    const url = new URL(window.location.toString());
    url.searchParams.set("agentConfig", newAgentConfig);
    window.location.replace(url.toString());
  };

  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    disconnectFromRealtime();
    setSelectedAgentName(newAgentName);
  };

  const handleCodecChange = (newCodec: string) => {
    const url = new URL(window.location.toString());
    url.searchParams.set("codec", newCodec);
    window.location.replace(url.toString());
  };

  useEffect(() => {
    const storedPushToTalkUI = localStorage.getItem("pushToTalkUI");
    if (storedPushToTalkUI) {
      setIsPTTActive(storedPushToTalkUI === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAudioPlaybackEnabled = localStorage.getItem(
      "audioPlaybackEnabled"
    );
    if (storedAudioPlaybackEnabled) {
      setIsAudioPlaybackEnabled(storedAudioPlaybackEnabled === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("pushToTalkUI", isPTTActive.toString());
  }, [isPTTActive]);

  useEffect(() => {
    localStorage.setItem("logsExpanded", isEventsPaneExpanded.toString());
  }, [isEventsPaneExpanded]);

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }

    try {
      mute(!isAudioPlaybackEnabled);
    } catch (err) {
      console.warn('Failed to toggle SDK mute', err);
    }
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (sessionStatus === 'CONNECTED') {
      try {
        mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn('mute sync after connect failed', err);
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && audioElementRef.current?.srcObject) {
      const remoteStream = audioElementRef.current.srcObject as MediaStream;
      startRecording(remoteStream);
    }

    return () => {
      stopRecording();
    };
  }, [sessionStatus]);

  const agentSetKey = searchParams.get("agentConfig") || "default";

  const handleUpdateCompany = () => {
    if (companyName.trim()) {
      const dynamicScenario = createCustomerServiceScenario(
        companyName.trim(),
        companyContext.trim()
      );
      setSelectedAgentConfigSet(dynamicScenario);
      setSelectedAgentName(dynamicScenario[0]?.name || '');
      setUseCustomCompany(false);
      disconnectFromRealtime();
      connectToRealtime();
    }
  };

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="p-5 text-lg font-semibold flex justify-between items-center bg-gradient-to-r from-gray-700 via-gray-800 to-gray-900 text-gray-200 shadow-md border-b border-gray-600">
        <div
          className="flex items-center cursor-pointer select-none"
          onClick={() => window.location.reload()}
          title="Reload page"
        >
          <div className="text-xl font-extrabold tracking-wide">
            RedHavana <span className="text-gray-400 font-normal">Voice Agent</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowContext(prev => !prev)}
            className="flex items-center gap-1 px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 transition-colors duration-300 text-sm font-semibold"
            title="Toggle Context"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transform transition-transform duration-300 ${showContext ? "rotate-180" : ""
                }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Context
          </button>

          {authLoading ? (
            <div className="w-10 h-10 bg-gray-600 rounded-full animate-pulse" />
          ) : currentUser ? (
            <div className="relative block">
              <button
                className="rounded-full overflow-hidden border-2 border-gray-400 hover:ring-4 hover:ring-gray-500 transition-shadow"
                onClick={() => setShowDropdown((prev) => !prev)}
                aria-label="User menu"
              >
                {currentUser.photoURL ? (
                  <Image
                    src={currentUser.photoURL}
                    alt="avatar"
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold uppercase">
                    {currentUser.email?.charAt(0) || "U"}
                  </div>
                )}
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-100 rounded-lg shadow-lg py-2 border z-50 text-gray-700">
                  <Link href="/chat-history" className="block px-4 py-2 hover:bg-gray-200">
                    Previous Chats
                  </Link>
                  {userRole === "admin" && (
                    <Link href="/dashboard/admin" className="block px-4 py-2 hover:bg-gray-200">
                      Admin Dashboard
                    </Link>
                  )}
                  {userRole === "superadmin" && (
                    <Link href="/dashboard/superadmin" className="block px-4 py-2 hover:bg-gray-200">
                      Superadmin Dashboard
                    </Link>
                  )}
                  {userRole === 'user' && (
                    <Link href="/dashboard/dashboard" className="block px-4 py-2 hover:bg-gray-200">
                      Dashboard
                    </Link>
                  )}
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-200 text-red-600"
                    onClick={() => signOut(auth)}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login">
              <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white font-semibold shadow-md transition-colors duration-300">
                Login
              </button>
            </Link>
          )}
        </div>
      </div>

      <div
        className={`overflow-hidden transition-[max-height,padding] duration-500 ${showContext ? "max-h-[500px] py-4" : "max-h-0 py-0"
          } bg-gray-100 rounded-b-lg shadow-inner`}
      >
        <div className="flex flex-wrap gap-4 items-end justify-center">
          <div className="flex flex-col gap-1 items-start">
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter your company name"
              className="border border-gray-300 rounded px-3 py-2 w-60 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <div className="flex flex-col gap-1 items-start">
            <label className="block text-sm font-medium text-gray-700">Company Context</label>
            <input
              type="text"
              value={companyContext}
              onChange={(e) => setCompanyContext(e.target.value)}
              placeholder="Brief description of your business"
              className="border border-gray-300 rounded px-3 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <button
            onClick={handleUpdateCompany}
            disabled={!companyName.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md transition-colors duration-300"
          >
            Update Agent
          </button>
        </div>
      </div>

      {/* <Header
        authLoading={authLoading}
        currentUser={currentUser}
        userRole={userRole as "user" | "admin" | "superadmin" | undefined}
        companyName={companyName}
        setCompanyName={setCompanyName}
        companyContext={companyContext}
        setCompanyContext={setCompanyContext}
        handleUpdateCompany={handleUpdateCompany}
      /> */}

      {showInsufficientCreditsModal === true && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Insufficient Credits</h2>
            <p className="mb-6">You do not have enough credits to continue the conversation. Please top up your account.</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => setShowInsufficientCreditsModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative p-5">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={handleSendTextMessage}
          downloadRecording={downloadRecording}
          canSend={
            sessionStatus === "CONNECTED"
          }
        />
        <Events isExpanded={isEventsPaneExpanded} />
      </div>

      <BottomToolbar
        sessionStatus={sessionStatus}
        onToggleConnection={onToggleConnection}
        isPTTActive={isPTTActive}
        setIsPTTActive={setIsPTTActive}
        isPTTUserSpeaking={isPTTUserSpeaking}
        handleTalkButtonDown={handleTalkButtonDown}
        handleTalkButtonUp={handleTalkButtonUp}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
        codec={urlCodec}
        onCodecChange={handleCodecChange}
        isConnectDisabled={!companyName.trim() || !companyContext.trim()}
      />
    </div >
  );
}

export default App;
