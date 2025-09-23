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
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../app/firebaseConfig";

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

    await setDoc(callDocRef, {
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

  useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      const url = new URL(window.location.toString());
      url.searchParams.set("agentConfig", finalAgentConfig);
      window.location.replace(url.toString());
      return;
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
        },
      });
    } catch (err) {
      console.error("Error connecting via SDK:", err);
      setSessionStatus("DISCONNECTED");
    }
  };

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

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    interrupt();

    try {
      sendUserText(userText.trim());
    } catch (err) {
      console.error('Failed to send via SDK', err);
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
      <div className="p-5 text-lg font-semibold flex justify-between items-center">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          {/* <div>
            <Image
              src=""
              width={20}
              height={20}
              className="mr-2"
            />
          </div> */}
          <div>
           RedHavana <span className="text-gray-500">Voice Agent</span>
          </div>
        </div>

        <div className="p-4 bg-blue-50 border-b">
          <div className="mx-auto flex gap-4 items-end">
            <div className="flex gap-5 items-center">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter your company name"
                className="border border-gray-300 rounded px-3 py-2 w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-5 items-center">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Context
              </label>
              <input
                type="text"
                value={companyContext}
                onChange={(e) => setCompanyContext(e.target.value)}
                placeholder="Brief description of your business"
                className="border border-gray-300 rounded px-3 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleUpdateCompany}
              disabled={!companyName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Update Agent
            </button>

            <Link href="/chat-history">
              <button className='text-white bg-black hover:bg-gray-900 px-4 py-2 rounded hover:bg-blue-700'>
                Chat History
              </button>
            </Link>
          </div>
        </div>
      </div>
      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative">
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
    </div>
  );
}

export default App;
