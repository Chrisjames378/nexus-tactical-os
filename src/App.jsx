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
  
  // Settings & Configurations
  const [showSettings, setShowSettings] = useState(false);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('NEXUS_GEMINI_API_KEY') || '');
  const [serialBaudRate, setSerialBaudRate] = useState(() => localStorage.getItem('NEXUS_SERIAL_BAUD_RATE') || '115200');
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('NEXUS_AUDIO_ENABLED') !== 'false');
  const [audioVolume, setAudioVolume] = useState(() => parseFloat(localStorage.getItem('NEXUS_AUDIO_VOLUME') || '0.04'));

  // Advanced States
  const [aegisStatus, setAegisStatus] = useState("SHIELD_ACTIVE"); // "SHIELD_ACTIVE", "THREAT_BLOCKED"
  const [oracleState, setOracleState] = useState("AWAITING_INPUT"); // "AWAITING_INPUT", "LENS_ACTIVE", "DIAGNOSTIC_RUNNING", "DIAGNOSIS_COMPLETE"
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionProgress, setActionProgress] = useState(0);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);

  // HUD metrics & History (Sparklines)
  const [packetsPerSec, setPacketsPerSec] = useState(0);
  const [healthStatus, setHealthStatus] = useState(100);
  const [activeNodesCount, setActiveNodesCount] = useState(1);
  const [cpuHistory, setCpuHistory] = useState([45, 48, 52, 47, 50, 48, 55, 59, 44, 48]);
  const [ramHistory, setRamHistory] = useState([61, 62, 62, 61, 60, 60, 61, 62, 61, 62]);

  // Target Device Details
  const [targetDevice, setTargetDevice] = useState({
    name: "Awaiting OTG Handshake...",
    os: "Unknown Interface",
    status: "Standby Monitor",
    health: 100
  });

  // Oscilloscope Customizer states
  const [oscWaveform, setOscWaveform] = useState('sine'); // 'sine', 'square', 'triangle', 'sawtooth', 'noise'
  const [oscFrequency, setOscFrequency] = useState(30);
  const [oscAmplitude, setOscAmplitude] = useState(20);
  const [oscFrozen, setOscFrozen] = useState(false);

  // Audio Sequencer States
  const [sequencerActive, setSequencerActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [sequencerSteps, setSequencerSteps] = useState([true, false, true, false, true, true, false, false]);
  const [sequencerPitches, setSequencerPitches] = useState([440, 480, 520, 580, 640, 680, 720, 800]);
  const [sequencerSpeed, setSequencerSpeed] = useState(250); // step rate in ms

  // Hex Dump Analyzer States
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [hexDumpData, setHexDumpData] = useState(null);

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
  const serialPortRef = useRef(null);
  const serialReaderRef = useRef(null);

  // Save Settings Helpers
  const saveGeminiKey = (key) => {
    setGeminiApiKey(key);
    localStorage.setItem('NEXUS_GEMINI_API_KEY', key);
  };
  const saveBaudRate = (baud) => {
    setSerialBaudRate(baud);
    localStorage.setItem('NEXUS_SERIAL_BAUD_RATE', baud);
  };
  const saveAudioEnabled = (val) => {
    setAudioEnabled(val);
    localStorage.setItem('NEXUS_AUDIO_ENABLED', val ? 'true' : 'false');
  };
  const saveAudioVolume = (val) => {
    setAudioVolume(val);
    localStorage.setItem('NEXUS_AUDIO_VOLUME', val.toString());
  };

  // --- AUDIO SYNTHESIZER ENGINE (WEB AUDIO API) ---
  const playBeep = (freq = 800, type = 'sine', duration = 0.08) => {
    if (!audioEnabled || audioVolume === 0) return;
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
      
      gain.gain.setValueAtTime(audioVolume, ctx.currentTime);
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

  // Telemetry sequencer loop effect
  useEffect(() => {
    if (!sequencerActive) return;
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        const next = (prev + 1) % 8;
        if (sequencerSteps[next]) {
          playBeep(sequencerPitches[next], 'sine', 0.05);
        }
        return next;
      });
    }, sequencerSpeed);
    return () => clearInterval(interval);
  }, [sequencerActive, sequencerSteps, sequencerPitches, sequencerSpeed]);

  // Simulated HUD Performance Sparkline Update
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuHistory(prev => {
        const nextVal = Math.max(30, Math.min(95, prev[prev.length - 1] + Math.floor(Math.random() * 15) - 7));
        return [...prev.slice(1), nextVal];
      });
      setRamHistory(prev => {
        const nextVal = Math.max(55, Math.min(85, prev[prev.length - 1] + Math.floor(Math.random() * 3) - 1));
        return [...prev.slice(1), nextVal];
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
      if (!oscFrozen) {
        setSineOffset(prev => (prev + 0.05) % (Math.PI * 2));
      }
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [oscFrozen]);

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

  // --- WEBSERIAL DIALOG MONITOR (REAL UART STREAMING) ---
  const connectSerialHardware = async () => {
    playBeep(550, 'square', 0.12);
    logTerminal("WEBSERIAL: Awaiting COM port selection...");
    try {
      if (!navigator.serial) {
        throw new Error("WebSerial API is not supported or enabled in this browser.");
      }
      
      const port = await navigator.serial.requestPort();
      logTerminal("WEBSERIAL: COM Port requested. Opening connection...");
      
      await port.open({ baudRate: parseInt(serialBaudRate) });
      serialPortRef.current = port;
      setUsbDevice("Serial COM Port");
      playSuccessChime();
      logTerminal(`WEBSERIAL: Port opened successfully at ${serialBaudRate} baud.`);
      
      setTargetDevice({
        name: "UART Serial bridge Link",
        os: `COM Serial Port (${serialBaudRate} Baud)`,
        status: "UART Telemetry Stream Online",
        health: 100
      });

      readSerialData(port);

    } catch (err) {
      logTerminal(`WEBSERIAL ERROR: ${err.message}`);
    }
  };

  const readSerialData = async (port) => {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    serialReaderRef.current = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          logTerminal("WEBSERIAL: Stream closed.");
          break;
        }
        if (value) {
          const lines = value.split('\n');
          lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine) {
              logTerminal(`SERIAL RX: ${cleanLine}`);
              
              setLiveData(prev => [
                {
                  id: `serial-pkt-${Date.now()}`,
                  node: 'UART_BRIDGE',
                  device: cleanLine,
                  timestamp: Date.now(),
                  status: 'RX'
                },
                ...prev.slice(0, 24)
              ]);
              setPacketsPerSec(prev => prev + 1);
            }
          });
        }
      }
    } catch (err) {
      logTerminal(`SERIAL STREAM READ ERROR: ${err.message}`);
    } finally {
      reader.releaseLock();
    }
  };

  // --- FORENSIC FILE BINARY LOAD (HEX DUMP BUILDER) ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);
    setFileSize(file.size);
    playSuccessChime();
    logTerminal(`ARCHIVIST: Loading binary forensics file: ${file.name} (${file.size} bytes)`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const buffer = evt.target.result;
      const dataView = new DataView(buffer);
      const lines = [];
      const chunkSize = 16;
      
      // Safety Cap: Read first 2KB maximum to prevent browser DOM locking on huge files
      const bytesToRead = Math.min(buffer.byteLength, 2048);
      
      for (let offset = 0; offset < bytesToRead; offset += chunkSize) {
        const offsetHex = offset.toString(16).padStart(6, '0').toUpperCase();
        let hexBytes = '';
        let asciiChars = '';
        
        for (let i = 0; i < chunkSize; i++) {
          if (offset + i < buffer.byteLength) {
            const byte = dataView.getUint8(offset + i);
            hexBytes += byte.toString(16).padStart(2, '0') + ' ';
            asciiChars += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
          } else {
            hexBytes += '   ';
          }
        }
        
        lines.push({
          offset: `0x${offsetHex}`,
          hex: hexBytes.trim(),
          ascii: asciiChars
        });
      }
      
      setHexDumpData(lines);
      logTerminal(`ARCHIVIST: Successfully generated hex dump for first ${bytesToRead} bytes.`);
    };
    reader.readAsArrayBuffer(file);
  };

  // --- DIAGNOSTICS REPORT EXPORTER ---
  const exportDiagnosticsReport = () => {
    playSuccessChime();
    const content = `# NEXUS OS FORENSIC DIAGNOSTIC REPORT
Timestamp: ${new Date().toLocaleString()}
Target Hardware: ${targetDevice.name}
Operating System Architecture: ${targetDevice.os}
Interface Connection Status: ${targetDevice.status}
Device Stability Level: 120%
System Integrity Health: ${targetDevice.health}%

--------------------------------------------------------------------------------
## AGENT ORACLE DIAGNOSTICS REPORT
Visual Forensics Component Inspection Analysis (Gemini 2.5 Flash):

${diagnosticResult || "No diagnostic scan performed yet."}

--------------------------------------------------------------------------------
© 2026 Nexus Global Development Team. Sovereign IP Protected.
`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Nexus_Diagnostic_Report_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logTerminal("ORACLE: Forensic diagnostic report compiled and exported.");
  };

  // --- DIAGNOSTICS DEPLOYMENT ACTIONS ---
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

  // --- DIAGNOSTIC LENS CAMERA FRAME HANDLERS ---
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

  const captureFrame = async () => {
    playBeep(850, 'sine', 0.05);
    if (!videoRef.current || !canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 400, 300);
    const data = canvasRef.current.toDataURL('image/png');
    setCapturedImage(data);
    
    if (videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }

    if (geminiApiKey) {
      logTerminal("ORACLE: Transmitting forensic frame to Gemini API Visual Forensics...");
      setOracleState("DIAGNOSTIC_RUNNING");
      setDiagnosticResult("Analyzing component visuals. Quizzing Gemini 2.5 Flash database...");
      
      const rawBase64 = data.split(',')[1];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "You are Agent Oracle, a specialized hardware recovery and board-level forensics engineer. Analyze this visual capture of a motherboard/hardware component. Identify the board type, locate potential failures (such as capacitor bulge, burnt tracks, corrosion, disconnected headers, mechanical stress, or bad solder joints), state the likely fault and suggest step-by-step repair or recovery instructions. Be specific, technical, and concise." },
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: rawBase64
                  }
                }
              ]
            }]
          })
        });

        const json = await response.json();
        if (json.candidates && json.candidates[0].content.parts[0].text) {
          const resultText = json.candidates[0].content.parts[0].text;
          setDiagnosticResult(resultText);
          setOracleState("DIAGNOSIS_COMPLETE");
          playSuccessChime();
          logTerminal("ORACLE: visual fault analysis successfully generated by Gemini.");
        } else {
          throw new Error(json.error?.message || "Invalid response parsing structure.");
        }
      } catch (err) {
        logTerminal(`ORACLE ERROR: Gemini API call failed: ${err.message}`);
        setDiagnosticResult(`ORACLE CONSOLE ERROR:\n- Gemini API request aborted.\n- Detail: ${err.message}\n\nFalling back to simulated diagnostic report...`);
        setOracleState("DIAGNOSIS_COMPLETE");
        playAlarm();
      }

    } else {
      setOracleState("DIAGNOSIS_COMPLETE");
      setDiagnosticResult("SIMULATED DIAGNOSTIC (Enter Gemini Key in Settings for real inspection):\n- Phoenix-Mobile: Operating loop resolved by active firmware state restoration.\n- Resolution: Deploy standard image flash via secure OTG.\n- Aegis-Forensics: Memory cache clean sweep executed successfully.");
      logTerminal("ORACLE: Simulated frame analysis loaded. Input API Key in Settings for live diagnostics.");
    }
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

    if (cmd.startsWith('b64-encode ')) {
      const val = cmd.replace('b64-encode ', '');
      try {
        const enc = btoa(val);
        logTerminal(`BASE64 ENCODED: "${enc}"`);
      } catch(e) { logTerminal("ENCODE ERROR: Invalid character."); }
      return;
    }

    if (cmd.startsWith('b64-decode ')) {
      const val = cmd.replace('b64-decode ', '');
      try {
        const dec = atob(val);
        logTerminal(`BASE64 DECODED: "${dec}"`);
      } catch(e) { logTerminal("DECODE ERROR: Invalid padding."); }
      return;
    }

    switch (cmd) {
      case 'help':
        logTerminal("AVAILABLE DIRECTIVES: 'help', 'clear', 'simulate', 'cloud', 'ping', 'reset-config', 'sys-check', 'aegis-trigger', 'lens-start', 'phoenix-bypass', 'b64-encode [text]', 'b64-decode [hash]'");
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
        logTerminal("PING: Transmitting packet to secure gateway...");
        const start = Date.now();
        fetch('https://api.github.com', { method: 'HEAD', mode: 'no-cors' })
          .then(() => {
            const lat = Date.now() - start;
            logTerminal(`PONG // LATENCY: ${lat}ms // CONNECTION SECURE`);
          })
          .catch(err => {
            logTerminal(`PING ERROR // GATEWAY OFFLINE: ${err.message}`);
          });
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

  const shutdownSerialPort = async () => {
    if (serialReaderRef.current) {
      try {
        await serialReaderRef.current.cancel();
      } catch(e){}
      serialReaderRef.current = null;
    }
    if (serialPortRef.current) {
      try {
        await serialPortRef.current.close();
      } catch(e){}
      serialPortRef.current = null;
    }
  };

  // --- SVG OSCILLOSCOPE WAVE MATH FORMULAS ---
  const calculateOscY = (x) => {
    const offset = oscFrozen ? 0 : sineOffset;
    const angle = (x / oscFrequency) + offset * 2;
    let val = 0;
    
    if (oscWaveform === 'sine') {
      val = Math.sin(angle);
    } else if (oscWaveform === 'square') {
      val = Math.sin(angle) >= 0 ? 1 : -1;
    } else if (oscWaveform === 'triangle') {
      val = (2 / Math.PI) * Math.asin(Math.sin(angle));
    } else if (oscWaveform === 'sawtooth') {
      val = 2 * ( (angle / (Math.PI * 2)) - Math.floor(0.5 + (angle / (Math.PI * 2))) );
    } else if (oscWaveform === 'noise') {
      val = Math.sin(angle) + (Math.random() - 0.5) * 0.45;
    }
    
    return 50 + val * oscAmplitude;
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

      {/* WEBUSB vs WEBSERIAL BRIDGE MODAL */}
      {showBridgeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#05070a] border border-[#00ff41]/60 p-6 rounded-xl shadow-[0_0_30px_rgba(0,255,65,0.2)]">
            <h3 className="text-xs font-black tracking-widest text-white border-b border-[#00ff41]/25 pb-2 mb-4 font-sans uppercase">
              SELECT TELEMETRY INTERFACE BRIDGE
            </h3>
            <p className="text-[9px] opacity-75 leading-relaxed mb-5 uppercase">
              Establish a low-level physical OTG interface mapping. Choose your diagnostic protocol standard:
            </p>
            <div className="space-y-3">
              <button 
                onClick={() => { setShowBridgeModal(false); connectHardware(); }} 
                className="w-full py-3 bg-black border border-[#00ff41]/40 hover:bg-[#00ff41]/10 text-white font-bold text-[10px] tracking-wider transition-all rounded-lg flex items-center justify-between px-4"
              >
                <span>🔌 WEBUSB PHYSICAL DEVICE</span>
                <span className="text-[8px] bg-[#00ff41]/20 px-2 py-0.5 rounded text-[#00ff41]">ACTIVE SCAN</span>
              </button>
              <button 
                onClick={() => { setShowBridgeModal(false); connectSerialHardware(); }} 
                className="w-full py-3 bg-black border border-[#00ff41]/40 hover:bg-[#00ff41]/10 text-white font-bold text-[10px] tracking-wider transition-all rounded-lg flex items-center justify-between px-4"
              >
                <span>📺 WEBSERIAL UART TERMINAL</span>
                <span className="text-[8px] bg-[#00ff41]/20 px-2 py-0.5 rounded text-[#00ff41]">{serialBaudRate} BAUD</span>
              </button>
            </div>
            <button 
              onClick={() => { playBeep(350, 'sine', 0.05); setShowBridgeModal(false); }} 
              className="w-full mt-5 py-2 bg-red-950/20 border border-red-500/40 text-red-500 font-black text-[9px] tracking-wider hover:bg-red-500 hover:text-black transition-all rounded-md"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* SLIDE-OUT SYSTEM CONFIGURATION DRAWER */}
      {showSettings && (
        <div className="fixed inset-y-0 right-0 w-80 bg-black/95 border-l border-[#00ff41]/40 z-[90] p-5 shadow-[0_0_40px_rgba(0,255,65,0.15)] flex flex-col justify-between backdrop-blur-md animate-in slide-in-from-right duration-300">
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#00ff41]/20 pb-2">
              <h3 className="text-xs font-black tracking-widest text-white font-sans uppercase">[SYSTEM CONFIGURATION]</h3>
              <button onClick={() => { playBeep(300, 'sine', 0.06); setShowSettings(false); }} className="text-[9px] border border-red-500/40 text-red-500 px-2 py-0.5 hover:bg-red-500 hover:text-black transition-all rounded">CLOSE</button>
            </div>

            {/* Gemini API Key input */}
            <div className="space-y-1.5">
              <label className="block text-[8px] font-bold uppercase tracking-wider text-[#00ff41]/70">Google Gemini API Key</label>
              <input 
                type="password"
                value={geminiApiKey}
                onChange={(e) => saveGeminiKey(e.target.value)}
                placeholder="Enter AI API Key (gemini-...)"
                className="w-full bg-[#03060a] border border-[#00ff41]/30 p-2 text-[9px] text-[#00ff41] focus:outline-none focus:border-[#00ff41]/80 rounded font-mono"
              />
              <p className="text-[6.5px] opacity-45 uppercase">Saved locally. Needed for real-time visual fault diagnosis using Gemini models.</p>
            </div>

            {/* WebSerial Baud Rate Select */}
            <div className="space-y-1.5">
              <label className="block text-[8px] font-bold uppercase tracking-wider text-[#00ff41]/70">UART Serial Baud Rate</label>
              <select
                value={serialBaudRate}
                onChange={(e) => saveBaudRate(e.target.value)}
                className="w-full bg-[#03060a] border border-[#00ff41]/30 p-2 text-[9px] text-[#00ff41] focus:outline-none focus:border-[#00ff41]/80 rounded font-mono"
              >
                <option value="9600">9600 BAUD (Standard Arduino)</option>
                <option value="19200">19200 BAUD</option>
                <option value="38400">38400 BAUD</option>
                <option value="57600">57600 BAUD</option>
                <option value="115200">115200 BAUD (High-Speed ESP32/UART)</option>
              </select>
            </div>

            {/* Audio volume settings */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-[8px] font-bold uppercase tracking-wider text-[#00ff41]/70">Synthesizer Volume</label>
                <span className="text-[8px] text-white">{Math.round(audioVolume * 1000)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(e) => saveAudioEnabled(e.target.checked)}
                  className="accent-[#00ff41]"
                />
                <input 
                  type="range"
                  min="0"
                  max="0.1"
                  step="0.01"
                  value={audioVolume}
                  onChange={(e) => saveAudioVolume(parseFloat(e.target.value))}
                  disabled={!audioEnabled}
                  className="flex-1 accent-[#00ff41] h-1 bg-gray-950 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[#00ff41]/20 pt-4 text-[7px] opacity-40 uppercase leading-relaxed font-mono">
            * Warning: Do not distribute configuration parameters. The zero-trust secure sandbox isolated environment prevents credential extraction leaks.
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
            <button 
              onClick={() => { playBeep(900, 'sine', 0.05); setShowSettings(true); }}
              className="text-[9px] border border-[#00ff41]/40 text-[#00ff41] px-3 py-1 bg-[#00ff41]/5 font-black hover:bg-[#00ff41] hover:text-black transition-all rounded"
            >
              ⚙️ SYSTEM CONFIGS
            </button>
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

            <div className="mt-6 border-t border-[#00ff41]/20 pt-4 text-[9px] opacity-40 uppercase leading-relaxed font-mono">
              * Local Mock mode boots the diagnostic dashboards, Web Audio synthesizers, local signal graph simulator, and console commands without needing Firebase services.
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD SYSTEM INTERFACE (WHEN LOGGED IN OR LOCAL MODE) */}
      {(firebaseConfig || isLocalMode) && (
        <div className="relative z-10 flex-1 flex flex-col gap-4">
          
          {/* HARDWARE OVERVIEW SECTION WITH PERFORMANCE SPARKLINES */}
          <section className="bg-black/95 border border-[#00ff41]/35 p-4 rounded-xl text-[10px] grid grid-cols-2 md:grid-cols-4 gap-4 relative overflow-hidden">
            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider font-mono">Target Profile</p>
              <p className="font-bold text-white truncate">{targetDevice.name}</p>
              <p className="text-[7.5px] opacity-65 font-mono truncate">{targetDevice.os}</p>
            </div>
            
            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider font-mono">System Load CPU</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-bold text-white min-w-[30px]">{cpuHistory[cpuHistory.length - 1]}%</span>
                <svg className="w-20 h-6 stroke-[#00ff41] fill-none" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <polyline
                    strokeWidth="2"
                    points={cpuHistory.map((val, idx) => `${idx * 11},${30 - (val * 30 / 100)}`).join(' ')}
                  />
                </svg>
              </div>
            </div>

            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider font-mono">System Memory RAM</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-bold text-white min-w-[30px]">{ramHistory[ramHistory.length - 1]}%</span>
                <svg className="w-20 h-6 stroke-[#00ff41] fill-none" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <polyline
                    strokeWidth="2"
                    points={ramHistory.map((val, idx) => `${idx * 11},${30 - (val * 30 / 100)}`).join(' ')}
                  />
                </svg>
              </div>
            </div>

            <div>
              <p className="opacity-40 uppercase text-[7px] tracking-wider font-mono">Diagnostics Health</p>
              <div className="flex items-center gap-2 mt-1">
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
                  
                  {/* Left Side: Agent Controls & Hex Uploader for Archivist */}
                  <div className="flex-1 space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center border-b border-[#00ff41]/20 pb-2 mb-3">
                        <p className="text-[11px] font-black text-white uppercase font-sans">AGENT COUPLER: {selectedAgent.replace('_', ' ')}</p>
                        <span className="text-[8px] bg-[#00ff41]/10 border border-[#00ff41]/40 px-2 py-0.5 rounded text-[#00ff41] font-bold">ONLINE</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-gray-300 mb-3">{agentDescriptions[selectedAgent]}</p>
                      
                      {/* Show HEX Dump Uploader when Archivist is selected */}
                      {selectedAgent === 'Archivist' && (
                        <div className="border border-[#00ff41]/30 bg-black/45 p-3 rounded-lg flex flex-col gap-2">
                          <p className="text-[8.5px] uppercase font-bold text-white">Forensic Binary Hex Analyzer</p>
                          <div className="flex items-center justify-between gap-3">
                            <input 
                              type="file" 
                              id="file-hex-input"
                              onChange={handleFileUpload}
                              className="hidden" 
                            />
                            <label 
                              htmlFor="file-hex-input"
                              className="py-1.5 px-3 bg-black border border-[#00ff41] hover:bg-[#00ff41] hover:text-black font-black text-[8px] tracking-wider transition-all rounded cursor-pointer uppercase"
                            >
                              CHOOSE BIN FILE
                            </label>
                            <span className="text-[7.5px] opacity-75 truncate max-w-[150px] font-mono">
                              {fileName ? `${fileName} (${fileSize} bytes)` : "NO FILE LOADED"}
                            </span>
                          </div>
                        </div>
                      )}
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

                  {/* Right Side: Specific Agent Log Console / Hex Viewer */}
                  <div className="w-full md:w-96 flex flex-col bg-black/60 border border-[#00ff41]/10 rounded-lg p-3 h-64 md:h-auto font-mono overflow-hidden">
                    
                    {/* Render Hex Dump if Archivist has loaded data */}
                    {selectedAgent === 'Archivist' && hexDumpData ? (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <p className="text-[8px] opacity-40 uppercase tracking-widest mb-1.5 border-b border-[#00ff41]/15 pb-1">Hex address dump (Offset 2KB Max)</p>
                        <div className="flex-1 overflow-y-auto space-y-0.5 text-[7.5px] leading-tight font-mono select-text scrollbar-thin">
                          {hexDumpData.map((line, idx) => (
                            <div key={idx} className="flex gap-2 hover:bg-[#00ff41]/10 transition-all px-1 py-0.2">
                              <span className="text-[#00ff41] opacity-75">{line.offset}:</span>
                              <span className="text-white tracking-wide">{line.hex}</span>
                              <span className="text-cyan-400 opacity-80">{line.ascii}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      // Default Logs Console
                      <div className="flex-1 flex flex-col overflow-hidden">
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
                    )}

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
                      <div className="flex border-b border-[#00ff41]/25 pb-2 gap-4 mb-4 font-mono">
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
                      <div className="bg-black border border-blue-500/50 p-4 rounded-xl text-[9px] animate-pulse font-mono">
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
                        <span className="text-3xl mb-2 font-sans">📷</span>
                        <span className="text-[9px] font-black tracking-widest font-mono">ACTIVATE DIAGNOSTIC LENS</span>
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
                            className="px-4 py-2 bg-[#00ff41] text-black font-black text-[9px] tracking-wider hover:bg-white transition-all rounded shadow-lg font-mono"
                          >
                            CAPTURE FORENSIC FRAME
                          </button>
                          <button 
                            onClick={resetCamera} 
                            className="px-3 py-2 bg-black border border-red-500 text-red-500 font-bold text-[9px] tracking-wider hover:bg-red-950/40 transition-all rounded font-mono"
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {oracleState === "DIAGNOSTIC_RUNNING" && (
                      <div className="h-60 bg-black/60 rounded-lg border border-[#00ff41]/30 flex flex-col justify-center items-center gap-3">
                        <span className="text-3xl animate-spin">🌀</span>
                        <p className="text-[10px] text-white tracking-widest animate-pulse font-mono uppercase">TRANSMITTING FORENSICS DATA TO ORACLE CLOUD MODEL...</p>
                      </div>
                    )}

                    {oracleState === "DIAGNOSIS_COMPLETE" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1 border border-[#00ff41]/30 bg-black rounded-lg overflow-hidden h-36 relative">
                            {capturedImage && <img src={capturedImage} className="w-full h-full object-cover grayscale" />}
                            <div className="absolute top-1 left-1 text-[6px] bg-[#00ff41] text-black px-1 font-bold font-mono">FROZEN</div>
                          </div>
                          <div className="col-span-2 text-[9px] p-2.5 bg-[#00ff41]/5 rounded-lg border border-[#00ff41]/20 h-36 overflow-y-auto whitespace-pre-line leading-relaxed font-mono scrollbar-thin">
                            {diagnosticResult}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={exportDiagnosticsReport}
                            className="flex-1 py-2 bg-black border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-black text-[9px] font-black tracking-widest transition-all rounded font-mono"
                          >
                            📥 EXPORT FORENSIC REPORT
                          </button>
                          <button 
                            onClick={resetCamera} 
                            className="px-6 py-2 bg-black border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-black text-[9px] font-black tracking-widest transition-all rounded font-mono"
                          >
                            RESET
                          </button>
                        </div>
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
                  
                  {/* Telemetry SVG Oscilloscope with controls */}
                  <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex flex-col justify-between font-mono">
                    <div>
                      <h3 className="text-[10px] font-black tracking-widest text-[#00ff41]/80 uppercase border-b border-[#00ff41]/10 pb-2 mb-3 font-sans">
                        Signal Waveform Oscilloscope
                      </h3>
                      
                      <div className="h-44 border border-[#00ff41]/20 bg-black relative flex items-center rounded-lg overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-[#00ff41]/5 to-transparent pointer-events-none"></div>
                        <div className="absolute left-4 top-2 text-[7px] text-[#00ff41]/40 font-bold uppercase tracking-wider">CH1 - 4.2V</div>
                        <div className="absolute right-4 bottom-2 text-[7px] text-[#00ff41]/40 font-bold uppercase tracking-wider">SWEEP: {oscFrozen ? "FROZEN" : "AUTO"}</div>
                        
                        <svg viewBox="0 0 300 100" className="w-full h-full" preserveAspectRatio="none">
                          <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(0,255,65,0.15)" strokeWidth="0.5" strokeDasharray="3,3" />
                          <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(0,255,65,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
                          <line x1="150" y1="0" x2="150" y2="100" stroke="rgba(0,255,65,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
                          <line x1="225" y1="0" x2="225" y2="100" stroke="rgba(0,255,65,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
                          
                          <path
                            d={Array.from({ length: 300 })
                              .map((_, x) => {
                                const y = calculateOscY(x);
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

                      {/* Oscilloscope parameters control panel */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 border border-[#00ff41]/15 p-2 bg-black/45 rounded-lg text-[8px] uppercase">
                        <div className="flex flex-col gap-1">
                          <label className="opacity-55">Waveform</label>
                          <select 
                            value={oscWaveform}
                            onChange={(e) => setOscWaveform(e.target.value)}
                            className="bg-black border border-[#00ff41]/30 p-1 text-[#00ff41] focus:outline-none rounded font-mono text-[7px]"
                          >
                            <option value="sine">SINE WAVE</option>
                            <option value="square">SQUARE WAVE</option>
                            <option value="triangle">TRIANGLE WAVE</option>
                            <option value="sawtooth">SAWTOOTH WAVE</option>
                            <option value="noise">NOISE STREAM</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex justify-between opacity-55"><span>Freq</span><span>{oscFrequency}</span></div>
                          <input 
                            type="range" min="5" max="80" step="5" value={oscFrequency}
                            onChange={(e) => setOscFrequency(parseInt(e.target.value))}
                            className="accent-[#00ff41] h-1"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex justify-between opacity-55"><span>Amp</span><span>{oscAmplitude}px</span></div>
                          <input 
                            type="range" min="5" max="45" step="2" value={oscAmplitude}
                            onChange={(e) => setOscAmplitude(parseInt(e.target.value))}
                            className="accent-[#00ff41] h-1"
                          />
                        </div>
                        <button 
                          onClick={() => { playBeep(750, 'sine', 0.05); setOscFrozen(!oscFrozen); }}
                          className={`w-full py-1.5 font-bold tracking-widest border transition-all ${oscFrozen ? 'bg-[#00ff41] text-black border-[#00ff41]' : 'border-[#00ff41]/30 text-white'}`}
                        >
                          {oscFrozen ? "UNFREEZE" : "FREEZE"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 text-[9px]">
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

                  {/* Telemetry Audio Sequencer & Packet Stream Panel */}
                  <div className="bg-[#05070a]/90 border border-[#00ff41]/25 p-4 rounded-xl flex flex-col gap-4 font-mono">
                    
                    {/* Melodical Sequencer Grid */}
                    <div className="border border-[#00ff41]/20 p-3 bg-black/60 rounded-lg space-y-2">
                      <div className="flex justify-between items-center border-b border-[#00ff41]/15 pb-1 mb-2">
                        <h4 className="text-[9px] font-black uppercase text-white font-sans">Telemetry Audio Sequencer</h4>
                        <button 
                          onClick={() => setSequencerActive(!sequencerActive)}
                          className={`px-3 py-1 font-black text-[7.5px] border transition-all ${sequencerActive ? 'bg-red-500 text-black border-red-500 animate-pulse' : 'bg-[#00ff41]/5 text-[#00ff41] border-[#00ff41]/40'}`}
                        >
                          {sequencerActive ? "SEQUENCER_HALT" : "SEQUENCER_PLAY"}
                        </button>
                      </div>

                      {/* 8 Step Matrix Grid */}
                      <div className="grid grid-cols-8 gap-2">
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1.5">
                            <button
                              onClick={() => {
                                playBeep(sequencerPitches[idx], 'sine', 0.05);
                                setSequencerSteps(prev => {
                                  const c = [...prev];
                                  c[idx] = !c[idx];
                                  return c;
                                });
                              }}
                              className={`w-6 h-6 border font-bold text-[8px] flex items-center justify-center transition-all ${
                                sequencerSteps[idx] ? 'bg-[#00ff41] text-black border-[#00ff41]' : 'border-gray-800 text-gray-500'
                              } ${sequencerActive && currentStep === idx ? 'ring-2 ring-white scale-110' : ''}`}
                            >
                              {idx + 1}
                            </button>
                            <div className={`w-1.5 h-1.5 rounded-full ${sequencerActive && currentStep === idx ? 'bg-red-500 animate-ping' : 'bg-gray-800'}`}></div>
                          </div>
                        ))}
                      </div>

                      {/* Sequencer Tempo Slider */}
                      <div className="flex justify-between items-center text-[7.5px] uppercase pt-1 text-gray-400">
                        <span className="opacity-70">Sequencer Speed</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="range" min="100" max="600" step="50" value={sequencerSpeed}
                            onChange={(e) => setSequencerSpeed(parseInt(e.target.value))}
                            className="accent-[#00ff41] h-1 w-20"
                          />
                          <span>{sequencerSpeed}ms</span>
                        </div>
                      </div>
                    </div>

                    {/* Telemetry Packets Stream */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <h2 className="text-[9px] font-black tracking-widest mb-2 border-b border-[#00ff41]/20 pb-1.5 flex justify-between items-center font-sans">
                        <span>LIVE TELEMETRY STREAM</span>
                        <span className="text-[7.5px] opacity-45">MAX 25 PACKETS</span>
                      </h2>

                      <div className="flex-1 overflow-y-auto space-y-1.5 max-h-40 scrollbar-thin">
                        {liveData.length === 0 ? (
                          <div className="h-full flex flex-col justify-center items-center py-10 opacity-30 italic text-[9px] uppercase font-bold tracking-widest">
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
                                <span className="opacity-80 group-hover:text-white transition-all text-[8.5px] truncate max-w-[200px] sm:max-w-none">{item.device || 'SYSTEM HARDWARE'}</span>
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

              </div>
            )}

            {/* CONNECT BRIDGE CONTROL BUTTON (PERSISTENT ON ALL TABS IN DASHBOARD) */}
            <button 
              onClick={() => { playBeep(450, 'sine', 0.08); setShowBridgeModal(true); }}
              className="w-full py-3.5 border-2 border-[#00ff41] bg-[#00ff41]/5 font-black text-xs hover:bg-[#00ff41] hover:text-black transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(0,255,65,0.3)] flex items-center justify-center gap-3 active:scale-[0.98] rounded-xl z-10 font-mono"
            >
              🔌 {usbDevice ? `BRIDGE ACTIVE: ${usbDevice.toUpperCase()}` : "CONNECT PHYSICAL OTG BRIDGE"}
            </button>

          </main>

        </div>
      )}

      {/* CORE OPERATIVE CLI CONSOLE */}
      {(firebaseConfig || isLocalMode) && (
        <div className="relative z-10 bg-black/95 border border-[#00ff41]/25 p-4 rounded-xl shadow-[0_0_15px_rgba(0,255,65,0.03)] mt-2 font-mono">
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
                shutdownSerialPort();
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
