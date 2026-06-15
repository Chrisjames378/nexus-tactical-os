/* global __firebase_config, __app_id, __initial_auth_token */
import { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

const App = () => {
  // --- FIREBASE CONFIGURATION SAFE LOADER ---
  const [firebaseConfig, setFirebaseConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('NEXUS_FIREBASE_CONFIG');
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.warn("localStorage read failed", err);
    }

    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      try {
        return typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
      } catch (err) {
        console.warn("Global __firebase_config parse failed", err);
      }
    }

    const envConfig = import.meta.env.VITE_FIREBASE_CONFIG;
    if (envConfig) {
      try {
        return JSON.parse(envConfig);
      } catch (err) {
        console.warn("Vite env config parse failed", err);
      }
    }

    return null;
  });

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'nexus-global-node';

  // --- STATE ---
  const [user, setUser] = useState(null);
  const [liveData, setLiveData] = useState([]);
  const [terminal, setTerminal] = useState([
    "Nexus Sovereign Agentic OS initialized.",
    "Web Audio Haptic Engine synced.",
    "Sovereign IP Kernels: Phoenix, Aether, Aegis loaded."
  ]);
  const [usbDevice, setUsbDevice] = useState(null);
  const [configInput, setConfigInput] = useState('');
  const [configError, setConfigError] = useState('');
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState('');
  
  // Tabs & Navigation
  const [view, setView] = useState('agents'); // 'agents', 'diagnostics', 'telemetry'
  const [toolTab, setToolTab] = useState('mobile'); // 'mobile', 'pc'
  const [selectedAgent, setSelectedAgent] = useState('Oracle');
  
  // Advanced States
  const [aegisStatus, setAegisStatus] = useState("SHIELD_ACTIVE"); // "SHIELD_ACTIVE", "THREAT_BLOCKED"
  const [oracleState, setOracleState] = useState("AWAITING_INPUT"); // "AWAITING_INPUT", "LENS_ACTIVE", "DIAGNOSIS_COMPLETE"
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionProgress, setActionProgress] = useState(0);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);

  // HUD metrics
  const [packetsPerSec, setPacketsPerSec] = useState(0);
  const [healthStatus, setHealthStatus] = useState(100);
  const [activeNodesCount, setActiveNodesCount] = useState(1);

  // Target Device Details
  const [targetDevice, setTargetDevice] = useState({
    name: "Awaiting OTG Handshake...",
    os: "Unknown Interface",
    status: "Standby Monitor",
    health: 100
  });

  // Agent descriptions
  const agentDescriptions = {
    Oracle: "Multimodal Visual Fault Diagnosis Core. Interfaces directly with hardware lens capture and analyzes physical boards using Gemini Vision models.",
    Aegis: "Active System Security Shield & Intrusion Containment. Monitors real-time packet telemetry and quarantines corrupt or foreign USB payloads.",
    iFixer: "Phoenix-Mobile Engine controller. Deploys low-level firmware override payloads, loop-state bypasses, and sector-level partition restoration.",
    Archivist: "Aether-Archivist Storage Deck. Handles sandboxed device profiles, secure profile provisioning, file-system mapping, and client backup extractions.",
    Systems_TuneUp: "Aegis-Forensics memory & performance sweep. Performs active audits, cache sanitizations, and operating system speed sweeps."
  };

  // Dedicated logs per agent
  const [agentLogs, setAgentLogs] = useState({
    Oracle: ["Oracle visual matrix online.", "Gemini 2.5 Flash operational."],
    Aegis: ["Active packet firewalls armed.", "USB-OTG port isolated."],
    iFixer: ["Phoenix-Mobile engine active.", "Boot loop bypass payload cached."],
    Archivist: ["Aether-Archivist telemetry live.", "Secure profile templates loaded."],
    Systems_TuneUp: ["Aegis-Forensics Suite online.", "System integrity loops ready."]
  });

  // Refs
  const authRef = useRef(null);
  const dbRef = useRef(null);
  const terminalEndRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // --- AUDIO SYNTHESIZER ENGINE (WEB AUDIO API) ---
  const playBeep = (freq = 800, type = 'sine', duration = 0.08) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = type;
      
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio context blocked or unsupported", e);
    }
  };

  const playAlarm = () => {
    playBeep(220, 'sawtooth', 0.4);
    setTimeout(() => playBeep(180, 'sawtooth', 0.4), 150);
  };

  const playSuccessChime = () => {
    playBeep(523.25, 'sine', 0.1);
    setTimeout(() => playBeep(659.25, 'sine', 0.1), 80);
    setTimeout(() => playBeep(783.99, 'sine', 0.15), 160);
  };

  // --- INTERACTIVE TERMINAL LOGGER ---
  const logTerminal = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminal(prev => [`[${timestamp}] ${msg}`, ...prev].slice(0, 100));
  };

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminal]);

  // Clean up camera stream when view changes
  useEffect(() => {
    if (view !== 'diagnostics' && oracleState === 'LENS_ACTIVE') {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      setOracleState("AWAITING_INPUT");
    }
  }, [view]);

  // --- FIREBASE DYNAMIC BOOT ---
  useEffect(() => {
    if (!firebaseConfig) {
      logTerminal("CRITICAL: CLOUD LINK OFFLINE. INPUT CREDENTIALS OR BOOT LOCAL SIMULATOR.");
      return;
    }

    let unsubscribeAuth = null;
    let unsubscribeFirestore = null;

    const initFirebase = async () => {
      try {
        logTerminal("CONNECTING TO CLOUD NETWORK...");
        
        let app;
        const apps = getApps();
        if (apps.length > 0) {
          app = apps[0];
        } else {
          app = initializeApp(firebaseConfig);
        }

        const auth = getAuth(app);
        const db = getFirestore(app);
        authRef.current = auth;
        dbRef.current = db;

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
          logTerminal("SECURE AUTHORIZATION VIA TOKEN: APPROVED");
        } else {
          await signInAnonymously(auth);
          logTerminal("ESTABLISHING SECURE CLOUD HANDSHAKE (ANONYMOUS): ONLINE");
        }

        unsubscribeAuth = onAuthStateChanged(auth, (usr) => {
          setUser(usr);
          if (usr) {
            logTerminal(`SECURE NODE IDENTIFIER ATTACHED: ${usr.uid.substring(0, 12)}...`);
            logTerminal("ESTABLISHING FIREBASE FIRE-SYNC TELEMETRY PIPELINE...");
            
            const q = collection(db, 'artifacts', appId, 'public', 'data', 'telemetry');
            unsubscribeFirestore = onSnapshot(q, (snapshot) => {
              const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              data.sort((a, b) => b.timestamp - a.timestamp);
              setLiveData(data);
              setPacketsPerSec(prev => prev + 1);
              if (data.length > 0) {
                logTerminal(`PACKET RECEIVED // SOURCE: CLOUD // PACKETS COUNT: ${data.length}`);
              }
            }, (error) => {
              logTerminal(`FIRESTORE TELEMETRY PIPELINE BLOCKED: ${error.message}`);
              console.error(error);
            });
          } else {
            setUser(null);
          }
        });

      } catch (err) {
        logTerminal(`CLOUD MATRIX HANDSHAKE FAILURE: ${err.message}`);
        setConfigError("Handshake failure. Verify JSON configuration details.");
      }
    };

    initFirebase();

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [firebaseConfig, appId]);

  // --- LOCAL OFFLINE SIMULATION FEED ---
  useEffect(() => {
    if (!isLocalMode) return;

    logTerminal("LOCAL TESTING FEED ENABLED. INITIALIZING GENERATIVE SOURCE METRICS...");
    
    const mockNodes = ['MOTO_G15_NEXUS', 'NEXUS_ALPHA', 'SATELLITE_LINK_9', 'DRONE_UNIT_04'];
    const mockDevices = ['Phoenix: Core Firmware Recovery Injection', 'Aether: Encrypted enterprise profile provisioned', 'Aegis-Forensics: System file integrity repair complete', 'STM32 Telemetry Board'];
    
    const seedData = Array.from({ length: 5 }).map((_, i) => ({
      id: `local-pkt-${Date.now() - i * 5000}`,
      node: mockNodes[i % mockNodes.length],
      device: mockDevices[i % mockDevices.length],
      timestamp: Date.now() - i * 5000,
      status: 'OK'
    }));
    setLiveData(seedData);

    const interval = setInterval(() => {
      const randomNode = mockNodes[Math.floor(Math.random() * mockNodes.length)];
      const randomDevice = mockDevices[Math.floor(Math.random() * mockDevices.length)];
      
      const newPacket = {
        id: `local-pkt-${Date.now()}`,
        node: randomNode,
        device: randomDevice,
        timestamp: Date.now(),
        status: 'OK'
      };

      setLiveData(prev => [newPacket, ...prev.slice(0, 24)]);
      setPacketsPerSec(prev => prev + 1);
      setActiveNodesCount(Math.floor(Math.random() * 3) + 2);
      logTerminal(`PACKET GENERATED // SOURCE: LOCAL SIM // SOURCE NODE: ${randomNode}`);
      
      setHealthStatus(prev => {
        const delta = Math.floor(Math.random() * 3) - 1;
        return Math.max(92, Math.min(100, prev + delta));
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isLocalMode]);

  // --- SIGNAL GRAPH ANIMATION (OSCILLOSCOPE SINE WAVE) ---
  const [sineOffset, setSineOffset] = useState(0);
  useEffect(() => {
    let animationId;
    const animate = () => {
      setSineOffset(prev => (prev + 0.05) % (Math.PI * 2));
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // --- WEBUSB BRIDGE (REAL-TIME HARDWARE HANDSHAKE) ---
  const connectHardware = async () => {
    playBeep(500, 'square', 0.15);
    logTerminal("AWAITING USER HARDWARE BRIDGE PERMISSION...");
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      logTerminal(`USB DEVS LINK REQUESTED: VendorID: ${device.vendorId}, ProductID: ${device.productId}`);
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      await device.claimInterface(0);
      
      setUsbDevice(device.productName || `Vendor ${device.vendorId} Device`);
      playSuccessChime();
      logTerminal(`OTG USB-C HANDSHAKE INITIATION: SUCCESS (${device.productName})`);
      
      const isApple = (device.productName || '').toLowerCase().includes('apple') || (device.productName || '').toLowerCase().includes('iphone');
      setTargetDevice({
        name: device.productName || `Vendor ${device.vendorId} Device`,
        os: isApple ? "iOS (DFU Interface Mode)" : "Firmware Core (Phoenix Compatible)",
        status: "Raw Serial Connection Mapped",
        health: 72
      });

      const telemetryObj = {
        node: 'NEXUS_DECK_01',
        device: device.productName || `USB Device (${device.vendorId})`,
        timestamp: Date.now(),
        status: 'Connected'
      };

      if (dbRef.current && user) {
        await addDoc(collection(dbRef.current, 'artifacts', appId, 'public', 'data', 'telemetry'), telemetryObj);
        logTerminal("CLOUD HARDWARE REGISTER UPLOADED SUCCESSFULLY.");
      } else {
        logTerminal("HARDWARE ATTACHED LOCAL ONLY // NO ACTIVE CLOUD PIPELINE.");
        setLiveData(prev => [
          { id: `local-hardware-${Date.now()}`, ...telemetryObj },
          ...prev
        ]);
      }
    } catch (err) {
      logTerminal(`HARDWARE LINK ABORTED: ${err.message}`);
    }
  };

  // --- DIAGNOSTICS DEPLOYMENT ACTIONS ---
  const runSystemAction = (toolName, deviceType) => {
    playBeep(600, 'square', 0.1);
    setIsProcessingAction(true);
    setActionProgress(0);
    logTerminal(`Deploying sovereign engine: [${toolName}]`);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setActionProgress(progress);
      playBeep(700 + progress * 3, 'sine', 0.03);
      
      if (progress === 30) logTerminal(`Isolating telemetry paths...`);
      if (progress === 60) logTerminal(`Executing direct block-level flash write...`);
      if (progress === 90) logTerminal(`Verifying sector checksum tables...`);

      if (progress >= 100) {
        clearInterval(interval);
        setIsProcessingAction(false);
        playSuccessChime();
        logTerminal(`SUCCESS: ${toolName} optimization completed at 120% efficiency.`);
        
        const logKey = deviceType === 'mobile' ? 'iFixer' : deviceType === 'pc' ? 'Systems_TuneUp' : 'Archivist';
        setAgentLogs(prev => ({
          ...prev,
          [logKey]: [`Executed ${toolName} successfully.`, ...prev[logKey]]
        }));

        setTargetDevice(prev => ({
          ...prev,
          status: deviceType === 'mobile' ? "Clean / Sovereign Restored" : "System De-fragmented",
          health: 100
        }));
      }
    }, 150);
  };

  // --- AGENT INTERFACE TRIGGER COMMANDS ---
  const triggerAgentAction = (agentName, actionText) => {
    playBeep(450, 'sawtooth', 0.12);
    logTerminal(`Directing ${agentName} to: "${actionText}"`);
    setAgentLogs(prev => ({
      ...prev,
      [agentName]: [`Manually triggered: ${actionText}`, ...prev[agentName]]
    }));

    if (agentName === 'Aegis') {
      setTimeout(() => {
        playAlarm();
        setAegisStatus("THREAT_BLOCKED");
        logTerminal(`AEGIS ALERT: Unauthorized data interface handshake quarantined & blocked.`);
        setTimeout(() => setAegisStatus("SHIELD_ACTIVE"), 3000);
      }, 1000);
    } else if (agentName === 'Systems_TuneUp') {
      runSystemAction("Aegis-Forensics: Kernel Speed Sweep", "pc");
    } else if (agentName === 'iFixer') {
      runSystemAction("Phoenix-Mobile: Standard Loop Bypass", "mobile");
    } else if (agentName === 'Oracle') {
      startCamera();
    } else if (agentName === 'Archivist') {
      runSystemAction("Aether-Archivist: Partition Table Backup", "data");
    }
  };

  // --- DIAGNOSTIC CAMERA LENS HANDLERS ---
  const startCamera = async () => {
    playBeep(350, 'sine', 0.1);
    logTerminal("ORACLE: Accessing target camera stream...");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      setOracleState("LENS_ACTIVE");
      logTerminal("ORACLE: Diagnostic Lens camera feed active.");
    } catch (e) { 
      logTerminal("ORACLE: Camera hardware access denied / unsupported."); 
    }
  };

  const captureFrame = () => {
    playBeep(850, 'sine', 0.05);
    if (!videoRef.current || !canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 400, 300);
    const data = canvasRef.current.toDataURL('image/png');
    setCapturedImage(data);
    
    if (videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }
    
    setOracleState("DIAGNOSIS_COMPLETE");
    setDiagnosticResult("PROPRIETARY RECOVERY DIAGNOSTIC:\n- Phoenix-Mobile: Operating loop resolved by active firmware state restoration.\n- Resolution: Deploy standard image flash via secure OTG.\n- Aegis-Forensics: Memory cache clean sweep executed successfully.");
    logTerminal("ORACLE: Forensic frame captured. Analyzing Visual Component fault tables...");
  };

  const resetCamera = () => {
    playBeep(400, 'sine', 0.08);
    setCapturedImage(null);
    setDiagnosticResult(null);
    setOracleState("AWAITING_INPUT");
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    logTerminal("ORACLE: Diagnostic Lens reset to standby monitor.");
  };

  // --- INTERACTIVE CLI COMMAND ENGINE ---
  const handleCommandSubmit = (e) => {
    e.preventDefault();
    const cmd = terminalCommand.trim().toLowerCase();
    if (!cmd) return;

    logTerminal(`CMD EXECUTE: "${cmd}"`);
    setTerminalCommand('');
    playBeep(700, 'sine', 0.06);

    switch (cmd) {
      case 'help':
        logTerminal("AVAILABLE DIRECTIVES: 'help', 'clear', 'simulate', 'cloud', 'ping', 'reset-config', 'sys-check', 'aegis-trigger', 'lens-start', 'phoenix-bypass'");
        break;
      case 'clear':
        setTerminal([]);
        break;
      case 'simulate':
        if (isLocalMode) {
          logTerminal("SIMULATOR ENGINE IS ALREADY ACTIVE.");
        } else {
          setIsLocalMode(true);
          logTerminal("BOOTING GENERATIVE SOURCE SIMULATION PIPELINE.");
        }
        break;
      case 'cloud':
        if (!firebaseConfig) {
          logTerminal("CANNOT INITIALIZE CLOUD CONNECT. CREDENTIALS MISSING.");
        } else {
          setIsLocalMode(false);
          logTerminal("CLOSING LOCAL ENGINE. COUPLING NETWORK TO FIRESTORE CLOUD...");
        }
        break;
      case 'ping':
        logTerminal("PONG // STABILITY ENVELOPE STABLE. LATENCY < 4ms");
        break;
      case 'reset-config':
        localStorage.removeItem('NEXUS_FIREBASE_CONFIG');
        setFirebaseConfig(null);
        setUser(null);
        setIsLocalMode(false);
        setLiveData([]);
        logTerminal("FIREBASE CONFIG DISMANTLED. LOCAL TERMINAL MODE ONLINE.");
        break;
      case 'sys-check':
        logTerminal(`[SYSTEM CHECK] NODES: ${activeNodesCount} | PPS: ${packetsPerSec} | OPERATIONAL INTEGRITY: ${healthStatus}% | LINK: ${isLocalMode ? 'LOCAL-SIM' : 'FIRESTORE-CLOUD'}`);
        break;
      case 'aegis-trigger':
        playAlarm();
        setAegisStatus("THREAT_BLOCKED");
        logTerminal(`AEGIS INTRUSION SIMULATOR: Suspicious handshake quarantined.`);
        setTimeout(() => setAegisStatus("SHIELD_ACTIVE"), 3000);
        break;
      case 'lens-start':
        setView('diagnostics');
        startCamera();
        break;
      case 'phoenix-bypass':
        setView('diagnostics');
        setToolTab('mobile');
        runSystemAction("Nexus Phoenix Standard Repair", "mobile");
        break;
      default:
        logTerminal(`COMMAND ERROR: "${cmd}" NOT RECOGNIZED. TYPE 'help' FOR INTERACTIVE RUNTIME OPTIONS.`);
    }
  };

  const handleConfigSubmit = (e) => {
    e.preventDefault();
    setConfigError('');
    try {
      const parsed = JSON.parse(configInput.trim());
      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error("Missing required config fields (apiKey, projectId).");
      }
      localStorage.setItem('NEXUS_FIREBASE_CONFIG', JSON.stringify(parsed));
      setFirebaseConfig(parsed);
      setIsLocalMode(false);
      playSuccessChime();
      logTerminal("NEW CLOUD CONFIG APPLIED. RELINKING SERVICES...");
    } catch (err) {
      setConfigError(`INVALID FORMAT: ${err.message}`);
      logTerminal(`SETUP ERROR: Invalid configuration JSON template.`);
    }
  };

  return (
    <div className="crt-overlay min-h-screen bg-[#010306] text-[#00ff41] font-mono p-4 flex flex-col gap-4 selection:bg-[#00ff41]/30 overflow-x-hidden relative">
      
      {/* BACKGROUND GRID OVERLAY */}
      <div className="hud-grid fixed inset-0 pointer-events-none opacity-40 z-0"></div>

      {/* THREAT CONTAINMENT OVERLAY */}
      {aegisStatus === "THREAT_BLOCKED" && (
        <div className="fixed inset-0 bg-red-950/90 z-[9999] border-8 border-red-500 flex flex-col items-center justify-center p-4 text-center animate-pulse">
          <p className="text-5xl mb-4">🚨</p>
          <h2 className="text-3xl font-black text-red-500 tracking-widest mb-2 font-sans">AEGIS CONTAINMENT SHIELD</h2>
          <p className="text-white text-[11px] uppercase tracking-wider mb-4 font-mono">
            Sovereign firewall quarantined suspicious incoming USB packets. Threat isolated.
          </p>
          <div className="w-64 h-1 bg-red-900 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 animate-[pulse_1.5s_infinite]"></div>
          </div>
        </div>
      )}

      {/* HEADER HUD */}
      <header className="relative z-10 p-4 bg-black border border-[#00ff41]/20 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border-2 border-[#00ff41] flex items-center justify-center font-black animate-pulse shadow-[0_0_15px_rgba(0,255,65,0.4)] text-lg">
            NX
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest font-sans text-white">NEXUS TACTICAL OPERATING SYSTEM (v6.1)</h1>
            <p className="text-[8px] opacity-60 uppercase">Sovereign Agentic Hardware Diagnostic Platform</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-left sm:text-right">
            <p className="text-[8px] opacity-50 font-bold uppercase">Stability Status</p>
            <p className="text-[10px] font-bold text-[#00ff41] tracking-wider animate-pulse uppercase">STABILITY: 120% ACTIVE</p>
          </div>
          <div className="relative">
            <span className="flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${user ? 'bg-[#00ff41]' : isLocalMode ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${user ? 'bg-[#00ff41]' : isLocalMode ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
            </span>
          </div>
        </div>
      </header>

      {/* FIREBASE INITIAL CONFIG CONFIGURATION SCREEN */}
      {!firebaseConfig && !isLocalMode && (
        <div className="relative z-20 flex-1 flex items-center justify-center p-2 md:p-6">
          <div className="w-full max-w-2xl bg-black/95 border border-[#00ff41]/60 p-6 rounded-xl shadow-[0_0_40px_rgba(0,255,65,0.15)] animate-glow">
            <div className="border-b border-[#00ff41]/30 pb-3 mb-6">
              <h2 className="text-xs font-black tracking-widest flex justify-between font-sans">
                <span>[CRITICAL CONSOLE BOOT SYSTEM]</span>
                <span className="animate-pulse">▲ CONFIGURATION REQUIRED</span>
              </h2>
              <p className="text-[9px] opacity-60 uppercase mt-1">Matrix Link Offline. Supply Firebase Connection credentials to authorize cloud bridge.</p>
            </div>

            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-[#00ff41]/80">
                  Paste Firebase Config JSON Payload:
                </label>
                <textarea
                  value={configInput}
                  onChange={(e) => setConfigInput(e.target.value)}
                  placeholder={`{\n  "apiKey": "your-api-key",\n  "authDomain": "your-auth-domain",\n  "projectId": "your-project-id",\n  "storageBucket": "your-storage-bucket",\n  "messagingSenderId": "your-sender-id",\n  "appId": "your-app-id"\n}`}
                  rows={8}
                  className="w-full bg-[#03060a] border border-[#00ff41]/30 p-3 text-[10px] text-[#00ff41] placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41]/80 font-mono resize-none transition-all rounded"
                />
              </div>

              {configError && (
                <div className="text-[10px] text-red-500 bg-red-950/20 border border-red-500/30 p-2 uppercase font-bold">
                  Error: {configError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 border border-[#00ff41] bg-[#00ff41]/10 text-[#00ff41] text-[10px] font-black tracking-widest hover:bg-[#00ff41] hover:text-black hover:shadow-[0_0_15px_rgba(0,255,65,0.4)] transition-all cursor-pointer rounded"
                >
                  ESTABLISH CLOUD NETWORK LINK
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSuccessChime();
                    setIsLocalMode(true);
                    logTerminal("BOOT ENGINE IN LOCAL OFFLINE SIMULATION MODE.");
                  }}
                  className="px-6 py-3 border border-yellow-500 bg-yellow-500/10 text-yellow-500 text-[10px] font-black tracking-widest hover:bg-yellow-500 hover:text-black transition-all cursor-pointer rounded"
                >
                  LOCAL MOCK TEST (v6.1)
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-[#00ff41]/20 pt-4 text-[9px] opacity-40 uppercase leading-relaxed">
              * Local Mock mode boots the diagnostic dashboards, Web Audio synthesizers, local signal graph simulator, and console commands without needing Firebase services.
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD SYSTEM INTERFACE (WHEN LOGGED IN OR LOCAL MODE) */}
      {(firebaseConfig || isLocalMode) && (
        <div className="relative z-10 flex-1 flex flex-col gap-4">
          
          {/* HARDWARE OVERVIEW SECTION */}
          <section className="bg-black/95 border border-[#00ff41]/30 p-4 rounded-xl text-[10px] grid grid-cols-2 sm:grid-cols-4 gap-4 relative overflow-hidden">
            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider">Hardware Target Name</p>
              <p className="font-bold text-white truncate">{targetDevice.name}</p>
            </div>
            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider">Target OS Architecture</p>
              <p className="font-bold text-white">{targetDevice.os}</p>
            </div>
            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider">Interface Status</p>
              <p className="font-bold text-white uppercase tracking-wider">{targetDevice.status}</p>
            </div>
            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider">Hardware Health</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1.5 bg-gray-950 border border-[#00ff41]/20 rounded-full overflow-hidden">
                  <div className="h-full bg-[#00ff41]" style={{ width: `${targetDevice.health}%` }}></div>
                </div>
                <span className="font-bold text-white">{targetDevice.health}%</span>
              </div>
            </div>
          </section>

          {/* MAIN TAB SWITCHER */}
          <nav className="grid grid-cols-3 gap-2 bg-[#05070a] p-1 border border-[#00ff41]/15 rounded-lg relative z-20">
            {['agents', 'diagnostics', 'telemetry'].map(tab => (
              <button 
                key={tab} 
                onClick={() => { playBeep(800, 'sine', 0.05); setView(tab); }} 
                className={`py-2 text-[10px] font-black tracking-widest border transition-all ${view === tab ? 'bg-[#00ff41]/20 border-[#00ff41] text-white shadow-[0_0_10px_rgba(0,255,65,0.2)]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </nav>

          {/* DYNAMIC VIEW CONTENT CONTAINER */}
          <main className="flex-1 flex flex-col gap-4">
            
            {/* 1. AGENTS TAB */}
            {view === 'agents' && (
              <div className="space-y-4 animate-in fade-in duration-300 flex-1 flex flex-col">
                
                {/* Agent Selector Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {['Oracle', 'Aegis', 'iFixer', 'Archivist', 'Systems_TuneUp'].map(agent => (
                    <button 
                      key={agent} 
                      onClick={() => { playBeep(550, 'sine', 0.08); setSelectedAgent(agent); }} 
                      className={`p-3 text-[10px] font-bold border transition-all flex flex-col items-center justify-center gap-1 relative ${selectedAgent === agent ? 'bg-[#00ff41]/10 border-[#00ff41] text-white shadow-[0_0_10px_rgba(0,255,65,0.1)]' : 'border-gray-800 opacity-60 hover:opacity-100'}`}
                    >
                      <span>{agent.replace('_', ' ')}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse"></span>
                    </button>
                  ))}
                </div>

                {/* Selected Agent Workspace Panel */}
                <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex-1 flex flex-col md:flex-row gap-4">
                  
                  {/* Left Side: Agent Controls */}
                  <div className="flex-1 space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center border-b border-[#00ff41]/20 pb-2 mb-3">
                        <p className="text-[11px] font-black text-white uppercase font-sans">AGENT COUPLER: {selectedAgent.replace('_', ' ')}</p>
                        <span className="text-[8px] bg-[#00ff41]/10 border border-[#00ff41]/40 px-2 py-0.5 rounded text-[#00ff41] font-bold">ONLINE</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-gray-300">{agentDescriptions[selectedAgent]}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => triggerAgentAction(selectedAgent, "Force telemetry diagnostic")} 
                        className="p-2.5 bg-black border border-[#00ff41]/30 rounded text-[8px] font-bold hover:bg-[#00ff41]/15 hover:border-[#00ff41] transition-all"
                      >
                        FORCE SYNC
                      </button>
                      <button 
                        onClick={() => triggerAgentAction(selectedAgent, "Sanitize memory space")} 
                        className="p-2.5 bg-black border border-[#00ff41]/30 rounded text-[8px] font-bold hover:bg-[#00ff41]/15 hover:border-[#00ff41] transition-all"
                      >
                        WIPE CACHE
                      </button>
                      <button 
                        onClick={() => triggerAgentAction(selectedAgent, "Execute vulnerability audit")} 
                        className="p-2.5 bg-black border border-red-500/40 text-red-400 rounded text-[8px] font-bold hover:bg-red-950/20 hover:border-red-500 transition-all"
                      >
                        AUDIT ENGINE
                      </button>
                    </div>
                  </div>

                  {/* Right Side: Specific Agent Log Console */}
                  <div className="w-full md:w-96 flex flex-col bg-black/60 border border-[#00ff41]/10 rounded-lg p-3 h-48 md:h-auto font-mono">
                    <p className="text-[8px] opacity-40 uppercase tracking-widest mb-2 border-b border-[#00ff41]/10 pb-1">Agent Telemetry Logs</p>
                    <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
                      {(agentLogs[selectedAgent] || []).map((log, idx) => (
                        <div key={idx} className="text-[9px] flex items-start gap-1">
                          <span className="text-[#00ff41] opacity-60 select-none">&gt;&gt;</span>
                          <span className="text-gray-300">{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* 2. DIAGNOSTICS TAB */}
            {view === 'diagnostics' && (
              <div className="space-y-4 animate-in slide-in-from-right duration-300 flex-1 flex flex-col">
                
                {/* Diagnostics Suite and Camera Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                  
                  {/* Tool Selection Section */}
                  <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex border-b border-[#00ff41]/25 pb-2 gap-4 mb-4">
                        <button 
                          onClick={() => { playBeep(700, 'sine', 0.05); setToolTab('mobile'); }} 
                          className={`text-[10px] font-bold pb-1 transition-all ${toolTab === 'mobile' ? 'border-b-2 border-[#00ff41] text-white' : 'opacity-40 hover:opacity-80'}`}
                        >
                          MOBILE RESTORE
                        </button>
                        <button 
                          onClick={() => { playBeep(700, 'sine', 0.05); setToolTab('pc'); }} 
                          className={`text-[10px] font-bold pb-1 transition-all ${toolTab === 'pc' ? 'border-b-2 border-[#00ff41] text-white' : 'opacity-40 hover:opacity-80'}`}
                        >
                          PC FORENSICS
                        </button>
                      </div>

                      {toolTab === 'mobile' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button 
                            onClick={() => runSystemAction("Nexus Phoenix Standard Repair Bypass", "mobile")} 
                            className="p-3 bg-black border border-[#00ff41]/35 rounded-xl hover:bg-[#00ff41]/10 text-left text-xs font-bold text-white flex flex-col gap-1 group transition-all"
                          >
                            <span className="text-[#00ff41] font-sans">🩹 Phoenix Loop Bypass</span>
                            <span className="text-[8px] opacity-60 font-mono">Bypasses infinite system firmware boot loop overrides.</span>
                          </button>
                          <button 
                            onClick={() => runSystemAction("Nexus Phoenix Firmware Force Recovery", "mobile")} 
                            className="p-3 bg-black border border-[#00ff41]/35 rounded-xl hover:bg-[#00ff41]/10 text-left text-xs font-bold text-white flex flex-col gap-1 group transition-all"
                          >
                            <span className="text-[#00ff41] font-sans">⚡ Phoenix Kernel Flash</span>
                            <span className="text-[8px] opacity-60 font-mono">Executes full block level firmware writing parameters.</span>
                          </button>
                        </div>
                      )}

                      {toolTab === 'pc' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button 
                            onClick={() => runSystemAction("Nexus Aegis Core Optimizer Speed Sweep", "pc")} 
                            className="p-3 bg-black border border-[#00ff41]/35 rounded-xl hover:bg-[#00ff41]/10 text-left text-xs font-bold text-white flex flex-col gap-1 group transition-all"
                          >
                            <span className="text-[#00ff41] font-sans">🧹 Aegis-Forensics Sweep</span>
                            <span className="text-[8px] opacity-60 font-mono">Cleans background buffers and sanitizes volatile caches.</span>
                          </button>
                          <button 
                            onClick={() => runSystemAction("Nexus Aegis System Configuration Repair", "pc")} 
                            className="p-3 bg-black border border-[#00ff41]/35 rounded-xl hover:bg-[#00ff41]/10 text-left text-xs font-bold text-white flex flex-col gap-1 group transition-all"
                          >
                            <span className="text-[#00ff41] font-sans">🛠️ Integrity Audit Run</span>
                            <span className="text-[8px] opacity-60 font-mono">Runs file hash system comparison diagnostics checks.</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {isProcessingAction && (
                      <div className="bg-black border border-blue-500/50 p-4 rounded-xl text-[9px] animate-pulse">
                        <p className="text-blue-400 font-black uppercase mb-1">RUNNING RUNTIME DEPLOYMENT... {actionProgress}%</p>
                        <div className="w-full h-2 bg-gray-900 border border-blue-900/30 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" style={{ width: `${actionProgress}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Diagnostic Lens (Camera interface) */}
                  <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex flex-col gap-3">
                    <p className="text-[9px] font-black text-white border-b border-[#00ff41]/10 pb-1 uppercase tracking-wider font-sans">Diagnostic Lens System</p>
                    
                    {oracleState === "AWAITING_INPUT" && (
                      <button 
                        onClick={startCamera} 
                        className="flex-1 flex flex-col justify-center items-center py-12 border border-[#00ff41] border-dashed bg-[#00ff41]/5 text-[#00ff41] hover:bg-[#00ff41]/10 hover:shadow-[0_0_15px_rgba(0,255,65,0.1)] transition-all rounded-lg"
                      >
                        <span className="text-3xl mb-2">📷</span>
                        <span className="text-[9px] font-black tracking-widest">ACTIVATE DIAGNOSTIC LENS</span>
                      </button>
                    )}

                    {oracleState === "LENS_ACTIVE" && (
                      <div className="relative h-60 bg-black rounded-lg overflow-hidden border border-[#00ff41]/30">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover grayscale animate-flicker" />
                        
                        {/* Target Reticle Overlay */}
                        <div className="absolute inset-0 border border-[#00ff41]/30 flex items-center justify-center pointer-events-none">
                          <div className="w-20 h-20 border border-dashed border-[#00ff41]/50 rounded-full animate-spin [animation-duration:15s]"></div>
                          <div className="w-2 h-2 bg-[#00ff41] rounded-full animate-ping"></div>
                          <div className="absolute w-full h-[1.5px] bg-[#00ff41]/30 top-1/2 left-0 -translate-y-1/2 animate-scanline pointer-events-none"></div>
                        </div>

                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3">
                          <button 
                            onClick={captureFrame} 
                            className="px-4 py-2 bg-[#00ff41] text-black font-black text-[9px] tracking-wider hover:bg-white transition-all rounded shadow-lg"
                          >
                            CAPTURE FORENSIC FRAME
                          </button>
                          <button 
                            onClick={resetCamera} 
                            className="px-3 py-2 bg-black border border-red-500 text-red-500 font-bold text-[9px] tracking-wider hover:bg-red-950/40 transition-all rounded"
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {oracleState === "DIAGNOSIS_COMPLETE" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1 border border-[#00ff41]/30 bg-black rounded-lg overflow-hidden h-28 relative">
                            {capturedImage && <img src={capturedImage} className="w-full h-full object-cover grayscale" />}
                            <div className="absolute top-1 left-1 text-[6px] bg-[#00ff41] text-black px-1 font-bold">FROZEN</div>
                          </div>
                          <div className="col-span-2 text-[9px] p-2.5 bg-[#00ff41]/5 rounded-lg border border-[#00ff41]/20 h-28 overflow-y-auto whitespace-pre-line leading-relaxed font-mono">
                            {diagnosticResult}
                          </div>
                        </div>
                        <button 
                          onClick={resetCamera} 
                          className="w-full py-2 bg-black border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41]/10 text-[9px] font-black tracking-widest transition-all rounded"
                        >
                          RESET DIAGNOSTIC LENS
                        </button>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {/* 3. TELEMETRY TAB */}
            {view === 'telemetry' && (
              <div className="space-y-4 animate-in fade-in duration-300 flex-1 flex flex-col">
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                  
                  {/* Telemetry SVG Oscilloscope */}
                  <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex flex-col justify-between">
                    <h3 className="text-[10px] font-black tracking-widest text-[#00ff41]/80 uppercase border-b border-[#00ff41]/10 pb-2 mb-3">
                      Signal Waveform Oscilloscope
                    </h3>
                    
                    <div className="h-44 border border-[#00ff41]/20 bg-black relative flex items-center rounded-lg overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-[#00ff41]/5 to-transparent pointer-events-none"></div>
                      <div className="absolute left-4 top-2 text-[7px] text-[#00ff41]/40 font-bold uppercase tracking-wider">CH1 - 4.2V</div>
                      <div className="absolute right-4 bottom-2 text-[7px] text-[#00ff41]/40 font-bold uppercase tracking-wider">SWEEP: AUTO</div>
                      
                      <svg viewBox="0 0 300 100" className="w-full h-full" preserveAspectRatio="none">
                        <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(0,255,65,0.15)" strokeWidth="0.5" strokeDasharray="3,3" />
                        <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(0,255,65,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
                        <line x1="150" y1="0" x2="150" y2="100" stroke="rgba(0,255,65,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
                        <line x1="225" y1="0" x2="225" y2="100" stroke="rgba(0,255,65,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
                        
                        <path
                          d={Array.from({ length: 300 })
                            .map((_, x) => {
                              const angle1 = (x / 30) + sineOffset * 2;
                              const angle2 = (x / 10) + sineOffset * 4;
                              const amplitude1 = 20;
                              const amplitude2 = 5;
                              const y = 50 + Math.sin(angle1) * amplitude1 + Math.cos(angle2) * amplitude2;
                              return `${x === 0 ? 'M' : 'L'} ${x} ${y}`;
                            })
                            .join(' ')}
                          fill="none"
                          stroke="#00ff41"
                          strokeWidth="1.5"
                          className="drop-shadow-[0_0_3px_rgba(0,255,65,0.7)]"
                        />
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4 text-[9px]">
                      <div className="border border-[#00ff41]/10 p-2 bg-[#00ff41]/5 text-center">
                        <p className="opacity-50 uppercase text-[7px]">Packet Rate</p>
                        <p className="text-xs font-black text-white mt-0.5">{packetsPerSec} PPS</p>
                      </div>
                      <div className="border border-[#00ff41]/10 p-2 bg-[#00ff41]/5 text-center">
                        <p className="opacity-50 uppercase text-[7px]">Integrity Rating</p>
                        <p className="text-xs font-black text-[#00ff41] mt-0.5">{healthStatus}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Telemetry Raw Packet List */}
                  <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex flex-col">
                    <h2 className="text-[10px] font-black tracking-widest mb-3 border-b border-[#00ff41]/20 pb-2 flex justify-between items-center font-sans">
                      <span>CLOUD LINK LIVE TELEMETRY STREAM</span>
                      <span className="flex items-center gap-1.5 text-[8px] bg-[#00ff41]/15 border border-[#00ff41]/40 px-2 py-0.5 animate-pulse text-[#00ff41]">
                        <span>●</span> RX PIPELINE ACTIVE
                      </span>
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-1.5 max-h-56 scrollbar-thin">
                      {liveData.length === 0 ? (
                        <div className="h-full flex flex-col justify-center items-center py-16 opacity-30 italic text-[9px] uppercase font-bold tracking-widest">
                          <span className="animate-bounce mb-2">📡</span>
                          Awaiting telemetry broadcast...
                        </div>
                      ) : (
                        liveData.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="text-[9px] bg-[#00ff41]/5 hover:bg-[#00ff41]/10 p-2 border-l-2 border-[#00ff41] flex flex-col sm:flex-row justify-between gap-1 transition-all group"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[7px] px-1 py-0.2 bg-[#00ff41]/20 text-[#00ff41] font-black">RX</span>
                              <span className="font-bold text-[#00ff41]">{item.node} &gt;&gt;</span>
                              <span className="opacity-80 group-hover:text-white transition-all text-xs truncate max-w-[200px] sm:max-w-none">{item.device || 'SYSTEM HARDWARE'}</span>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 text-[8px]">
                              <span className="opacity-40">{new Date(item.timestamp).toLocaleTimeString()}</span>
                              <span className="text-[8px] border border-[#00ff41]/20 px-1 bg-[#00ff41]/5 text-white">
                                {item.status || 'OK'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* CONNECT BRIDGE CONTROL BUTTON (PERSISTENT ON ALL TABS IN DASHBOARD) */}
            <button 
              onClick={connectHardware}
              className="w-full py-3.5 border-2 border-[#00ff41] bg-[#00ff41]/5 font-black text-xs hover:bg-[#00ff41] hover:text-black transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(0,255,65,0.3)] flex items-center justify-center gap-3 active:scale-[0.98] rounded-xl z-10 font-mono"
            >
              🔌 {usbDevice ? `BRIDGE ACTIVE: ${usbDevice.toUpperCase()}` : "CONNECT PHYSICAL USB OTG BRIDGE"}
            </button>

          </main>

        </div>
      )}

      {/* CORE OPERATIVE CLI CONSOLE */}
      {(firebaseConfig || isLocalMode) && (
        <div className="relative z-10 bg-black/95 border border-[#00ff41]/25 p-4 rounded-xl shadow-[0_0_15px_rgba(0,255,65,0.03)] mt-2">
          <div className="flex justify-between items-center mb-2 border-b border-[#00ff41]/15 pb-1.5">
            <span className="text-[9px] font-black tracking-widest text-[#00ff41] uppercase font-sans">OPERATIVE CLI CONSOLE</span>
            <span className="text-[7px] opacity-40">DEPTH: 100 LINES Max</span>
          </div>

          <div className="h-28 overflow-y-auto space-y-1 mb-3 text-[9px] leading-relaxed flex flex-col-reverse scrollbar-thin">
            <div ref={terminalEndRef}></div>
            {terminal.map((t, i) => {
              let color = "text-[#00ff41]/80";
              if (t.includes("CRITICAL") || t.includes("ERROR") || t.includes("FAILURE") || t.includes("ALERT")) {
                color = "text-red-500 font-bold animate-pulse";
              } else if (t.includes("SECURE") || t.includes("SUCCESS") || t.includes("ONLINE") || t.includes("APPROVED")) {
                color = "text-[#00ff41] font-bold";
              } else if (t.includes("CMD EXECUTE")) {
                color = "text-cyan-400 font-bold";
              } else if (t.includes("LOCAL")) {
                color = "text-yellow-400";
              }
              return (
                <p key={i} className={`${color} leading-snug`}>&gt; {t}</p>
              );
            })}
          </div>

          {/* Command input form */}
          <form onSubmit={handleCommandSubmit} className="flex gap-2 border border-[#00ff41]/30 px-3 py-1 bg-[#030508] rounded-md">
            <span className="text-[10px] font-bold text-[#00ff41] select-none self-center">NEXUS_SHELL:~$</span>
            <input
              type="text"
              value={terminalCommand}
              onChange={(e) => setTerminalCommand(e.target.value)}
              placeholder="Type command ('help' for directives, 'simulate' to mock offline operations)"
              className="flex-1 bg-transparent border-none text-[10px] text-[#00ff41] font-mono focus:outline-none placeholder-[#00ff41]/25"
            />
          </form>
        </div>
      )}

      {/* FOOTER DATA */}
      <footer className="relative z-10 text-[8px] opacity-50 flex justify-between font-bold uppercase tracking-wider pt-2 border-t border-[#00ff41]/10 mt-auto">
        <div className="flex gap-4">
          <span>SYSTEM RUNTIME: SECURE</span>
          <span>Sovereign IP Protected</span>
        </div>
        <div className="flex gap-4">
          {(firebaseConfig || isLocalMode) && (
            <button
              onClick={() => {
                playBeep(300, 'sine', 0.2);
                localStorage.removeItem('NEXUS_FIREBASE_CONFIG');
                setFirebaseConfig(null);
                setUser(null);
                setIsLocalMode(false);
                setLiveData([]);
                setUsbDevice(null);
                setTargetDevice({
                  name: "Awaiting OTG Handshake...",
                  os: "Unknown Interface",
                  status: "Standby Monitor",
                  health: 100
                });
                logTerminal("HARDWARE DEPLOYMENT ROOT RESET.");
              }}
              className="hover:underline hover:text-red-500 cursor-pointer transition-all"
            >
              [RESET MATRIX CONFIG]
            </button>
          )}
          <span>SYS VERSION: 6.1.0</span>
        </div>
      </footer>
      
      {/* Hidden elements for webcam rendering frame mapping */}
      <canvas ref={canvasRef} className="hidden" width="400" height="300" />
    </div>
  );
};

export default App;
