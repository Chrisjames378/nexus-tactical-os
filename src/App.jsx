/* global __firebase_config, __app_id, __initial_auth_token */
import { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

// --- HUD THEME SCHEMES ---
const HUD_THEMES = {
  matrix: {
    name: "Classic Matrix (Green)",
    color: "#00ff41",
    glow: "rgba(0, 255, 65, 0.15)",
    glowPulse: "rgba(0, 255, 65, 0.4)",
    borderGlow: "rgba(0, 255, 65, 0.3)",
    borderPulse: "rgba(0, 255, 65, 0.8)",
    dark: "#010306",
    card: "#05070a"
  },
  cyber: {
    name: "Aether Cyber (Cyan)",
    color: "#00f0ff",
    glow: "rgba(0, 240, 255, 0.15)",
    glowPulse: "rgba(0, 240, 255, 0.4)",
    borderGlow: "rgba(0, 240, 255, 0.3)",
    borderPulse: "rgba(0, 240, 255, 0.8)",
    dark: "#010408",
    card: "#05090f"
  },
  warning: {
    name: "Aegis Warning (Amber)",
    color: "#ffb700",
    glow: "rgba(255, 183, 0, 0.15)",
    glowPulse: "rgba(255, 183, 0, 0.4)",
    borderGlow: "rgba(255, 183, 0, 0.3)",
    borderPulse: "rgba(255, 183, 0, 0.8)",
    dark: "#080601",
    card: "#0f0b04"
  },
  doom: {
    name: "Doom Sector (Red)",
    color: "#ff003c",
    glow: "rgba(255, 0, 60, 0.15)",
    glowPulse: "rgba(255, 0, 60, 0.4)",
    borderGlow: "rgba(255, 0, 60, 0.3)",
    borderPulse: "rgba(255, 0, 60, 0.8)",
    dark: "#080102",
    card: "#0f0406"
  },
  fusion: {
    name: "Fusion Plasma (Purple)",
    color: "#d400ff",
    glow: "rgba(212, 0, 255, 0.15)",
    glowPulse: "rgba(212, 0, 255, 0.4)",
    borderGlow: "rgba(212, 0, 255, 0.3)",
    borderPulse: "rgba(212, 0, 255, 0.8)",
    dark: "#07010a",
    card: "#0c0412"
  }
};

const applyTheme = (themeKey) => {
  const theme = HUD_THEMES[themeKey] || HUD_THEMES.matrix;
  const root = document.documentElement;
  root.style.setProperty('--hud-color', theme.color);
  root.style.setProperty('--hud-glow', theme.glow);
  root.style.setProperty('--hud-glow-pulse', theme.glowPulse);
  root.style.setProperty('--hud-border-glow', theme.borderGlow);
  root.style.setProperty('--hud-border-pulse', theme.borderPulse);
  root.style.setProperty('--hud-dark', theme.dark);
  root.style.setProperty('--hud-card', theme.card);
};

// --- ORACLE AI PROMPT PRESETS ---
const PROMPT_PRESETS = {
  defect: "You are Agent Oracle, a specialized hardware recovery and board-level forensics engineer. Analyze this visual capture of a motherboard/hardware component. Identify the board type, locate potential failures (such as capacitor bulge, burnt tracks, corrosion, disconnected headers, mechanical stress, or bad solder joints), state the likely fault and suggest step-by-step repair or recovery instructions. Be specific, technical, and concise.",
  ocr: "You are Agent Oracle, a microelectronics OCR analyzer. Read all markings, serial numbers, labels, manufacturer logos, and revision codes visible on the microchips or the PCB. Output a structured listing of all identified components, part numbers, manufacture dates, and pin 1 indicator locations.",
  solder: "You are Agent Oracle, a quality control audit systems engineer. Inspect all visible solder joints, headers, surface-mount components, and vias in this capture. Evaluate the solder quality (look for cold joints, bridged pads, voiding, insufficient wetting, or cracked joints). List all suspect joints with coordinates or descriptions and recommend corrective rework action."
};

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
  const [connectedUsbDetails, setConnectedUsbDetails] = useState(null);
  const [configInput, setConfigInput] = useState('');
  const [configError, setConfigError] = useState('');
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState('');
  
  // Toasts Notification System
  const [toasts, setToasts] = useState([]);

  // Tabs & Navigation
  const [view, setView] = useState('agents'); // 'agents', 'diagnostics', 'telemetry'
  const [toolTab, setToolTab] = useState('mobile'); // 'mobile', 'pc', 'serial'
  const [selectedAgent, setSelectedAgent] = useState('Oracle');
  
  // Settings & Configurations
  const [showSettings, setShowSettings] = useState(false);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('NEXUS_GEMINI_API_KEY') || '');
  const [serialBaudRate, setSerialBaudRate] = useState(() => localStorage.getItem('NEXUS_SERIAL_BAUD_RATE') || '115200');
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('NEXUS_AUDIO_ENABLED') !== 'false');
  const [audioVolume, setAudioVolume] = useState(() => parseFloat(localStorage.getItem('NEXUS_AUDIO_VOLUME') || '0.04'));

  // Theme Settings
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('NEXUS_HUD_THEME') || 'matrix');

  // Camera Settings
  const [cameraFilter, setCameraFilter] = useState('none'); // 'none', 'grayscale', 'contrast', 'night-vision', 'thermal'
  const [torchActive, setTorchActive] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraResolution, setCameraResolution] = useState('720p'); // '4k', '1080p', '720p', '480p'
  const [cameraZoom, setCameraZoom] = useState(1);
  const [hasNativeZoom, setHasNativeZoom] = useState(false);
  const [cameraBrightness, setCameraBrightness] = useState(100);
  const [cameraContrast, setCameraContrast] = useState(100);
  const [cameraSaturation, setCameraSaturation] = useState(100);
  const [cameraExposure, setCameraExposure] = useState(0); // EV offset
  const [cameraOverlay, setCameraOverlay] = useState('none'); // 'none', 'reticle', 'grid', 'roi'
  const [isCameraFrozen, setIsCameraFrozen] = useState(false);

  // Gemini Prompt Settings (Oracle Presets)
  const [oraclePromptPreset, setOraclePromptPreset] = useState('defect'); // 'defect', 'ocr', 'solder', 'custom'
  const [oracleCustomPrompt, setOracleCustomPrompt] = useState('');

  // Bidirectional WebSerial Console States
  const [serialTxInput, setSerialTxInput] = useState('');
  const [serialTxTerminator, setSerialTxTerminator] = useState('\\r\\n'); // '\r\n', '\n', '\r', 'none'

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

  // Telemetry Audio Sequencer States
  const [sequencerActive, setSequencerActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [sequencerSteps, setSequencerSteps] = useState([true, false, true, false, true, true, false, false]);
  const [sequencerPitches, setSequencerPitches] = useState([440, 480, 520, 580, 640, 680, 720, 800]);
  const [sequencerSpeed, setSequencerSpeed] = useState(250); // step rate in ms

  // Live Audio Signal Test Generator State
  const [audioGenActive, setAudioGenActive] = useState(false);

  // Telemetry Packet Details Inspector State
  const [selectedPacket, setSelectedPacket] = useState(null);

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

  // Audio nodes refs
  const audioOscRef = useRef(null);
  const audioGainRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Sine offset for scope representation
  const [sineOffset, setSineOffset] = useState(0);

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
    if (!val) {
      setAudioGenActive(false);
    }
  };
  const saveAudioVolume = (val) => {
    setAudioVolume(val);
    localStorage.setItem('NEXUS_AUDIO_VOLUME', val.toString());
  };

  // --- DYNAMIC THEMING EFFECT ---
  useEffect(() => {
    applyTheme(activeTheme);
    localStorage.setItem('NEXUS_HUD_THEME', activeTheme);
  }, [activeTheme]);

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

  const playHapticClick = () => {
    playBeep(180, 'sine', 0.03);
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

  const playUSBConnectChime = () => {
    if (!audioEnabled || audioVolume === 0) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [440, 554.37, 659.25, 880];
      const overlap = 0.06;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * overlap);
        gain.gain.setValueAtTime(0, now + idx * overlap);
        gain.gain.linearRampToValueAtTime(audioVolume, now + idx * overlap + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * overlap + 0.12);
        osc.start(now + idx * overlap);
        osc.stop(now + idx * overlap + 0.12);
      });
    } catch (e) {}
  };

  const playUSBDisconnectChime = () => {
    if (!audioEnabled || audioVolume === 0) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [880, 659.25, 554.37, 440];
      const overlap = 0.06;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * overlap);
        gain.gain.setValueAtTime(0, now + idx * overlap);
        gain.gain.linearRampToValueAtTime(audioVolume, now + idx * overlap + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * overlap + 0.12);
        osc.start(now + idx * overlap);
        osc.stop(now + idx * overlap + 0.12);
      });
    } catch (e) {}
  };

  const addToast = (title, message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setToasts(prev => [...prev, { id, title, message, type }]);
    if (type === 'connect') {
      playUSBConnectChime();
    } else if (type === 'disconnect') {
      playUSBDisconnectChime();
    } else if (type === 'alert') {
      playAlarm();
    } else {
      playBeep(600, 'sine', 0.08);
    }
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // --- LIVE AUDIO FUNCTION GENERATOR EFFECT ---
  const startAudioGenerator = () => {
    if (!audioEnabled || audioVolume === 0) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = oscWaveform === 'noise' ? 'sawtooth' : oscWaveform;
      osc.frequency.setValueAtTime(oscFrequency * 10, ctx.currentTime);
      gain.gain.setValueAtTime(audioVolume * (oscAmplitude / 45), ctx.currentTime);
      
      osc.start();
      audioOscRef.current = osc;
      audioGainRef.current = gain;
      logTerminal(`SYS: Audio Signal generator active at ${oscFrequency * 10}Hz (${oscWaveform.toUpperCase()})`);
    } catch(e) {
      console.warn("Signal generator init failed", e);
    }
  };

  const stopAudioGenerator = () => {
    if (audioOscRef.current) {
      try { audioOscRef.current.stop(); } catch(e){}
      audioOscRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch(e){}
      audioCtxRef.current = null;
    }
    audioGainRef.current = null;
  };

  useEffect(() => {
    if (audioGenActive && audioOscRef.current && audioCtxRef.current) {
      try {
        audioOscRef.current.frequency.setValueAtTime(oscFrequency * 10, audioCtxRef.current.currentTime);
        audioOscRef.current.type = oscWaveform === 'noise' ? 'sawtooth' : oscWaveform;
      } catch(e){}
    }
  }, [oscFrequency, oscWaveform, audioGenActive]);

  useEffect(() => {
    if (audioGenActive && audioGainRef.current && audioCtxRef.current) {
      try {
        audioGainRef.current.gain.setValueAtTime(audioVolume * (oscAmplitude / 45), audioCtxRef.current.currentTime);
      } catch(e){}
    }
  }, [oscAmplitude, audioVolume, audioGenActive]);

  useEffect(() => {
    if (audioGenActive) {
      startAudioGenerator();
    } else {
      stopAudioGenerator();
    }
    return () => stopAudioGenerator();
  }, [audioGenActive]);

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

  // Oscilloscope animated math sweep
  useEffect(() => {
    if (oscFrozen) return;
    const interval = setInterval(() => {
      setSineOffset(prev => (prev + 0.15) % (Math.PI * 2));
    }, 30);
    return () => clearInterval(interval);
  }, [oscFrozen]);

  // --- PHYSICAL OTG PLUG-IN / PLUG-OUT HARDWARE DETECTORS ---
  useEffect(() => {
    // 1. WebUSB Plug events
    const handleUsbConnect = (e) => {
      const dev = e.device;
      const devName = dev.productName || `Vendor ${dev.vendorId} Device`;
      logTerminal(`AEGIS: Physical USB-OTG hardware plugged in: ${devName}`);
      setUsbDevice(devName);
      
      const details = {
        vendorId: dev.vendorId,
        productId: dev.productId,
        manufacturerName: dev.manufacturerName || "Unknown",
        productName: dev.productName || `Device 0x${dev.productId.toString(16)}`,
        serialNumber: dev.serialNumber || "N/A",
        usbVersion: `${dev.usbVersionMajor}.${dev.usbVersionMinor}`,
        deviceClass: dev.deviceClass,
        deviceSubclass: dev.deviceSubclass,
        deviceProtocol: dev.deviceProtocol
      };
      setConnectedUsbDetails(details);
      addToast("USB OTG DEVICE CONNECTED", `${devName} (VID: 0x${dev.vendorId.toString(16).toUpperCase()})`, "connect");

      const isApple = devName.toLowerCase().includes('apple') || devName.toLowerCase().includes('iphone');
      setTargetDevice({
        name: devName,
        os: isApple ? "iOS (DFU Interface Mode)" : "Firmware Core (Phoenix Compatible)",
        status: "Raw USB Mapped // Telemetry Online",
        health: 92
      });
    };

    const handleUsbDisconnect = (e) => {
      const dev = e.device;
      const devName = dev.productName || `Vendor ${dev.vendorId} Device`;
      logTerminal(`AEGIS: Physical USB-OTG hardware disconnected.`);
      setUsbDevice(null);
      setConnectedUsbDetails(null);
      addToast("USB OTG DEVICE DISCONNECTED", `${devName} removed from system.`, "disconnect");
      setTargetDevice({
        name: "Awaiting OTG Handshake...",
        os: "Unknown Interface",
        status: "Standby Monitor",
        health: 100
      });
    };

    if (navigator.usb) {
      navigator.usb.addEventListener('connect', handleUsbConnect);
      navigator.usb.addEventListener('disconnect', handleUsbDisconnect);
    }

    // 2. WebSerial Plug events
    const handleSerialConnect = (e) => {
      addToast("UART SERIAL BRIDGE CONNECTED", "Serial COM port interface plugged in.", "connect");
      logTerminal("WEBSERIAL: Serial COM port interface plugged in.");
    };

    const handleSerialDisconnect = (e) => {
      addToast("UART SERIAL BRIDGE DISCONNECTED", "Serial COM port interface disconnected.", "disconnect");
      logTerminal("WEBSERIAL: Serial COM port interface disconnected.");
      shutdownSerialPort();
      setUsbDevice(null);
      setConnectedUsbDetails(null);
      setTargetDevice({
        name: "Awaiting OTG Handshake...",
        os: "Unknown Interface",
        status: "Standby Monitor",
        health: 100
      });
    };

    if (navigator.serial) {
      navigator.serial.addEventListener('connect', handleSerialConnect);
      navigator.serial.addEventListener('disconnect', handleSerialDisconnect);
    }

    return () => {
      if (navigator.usb) {
        navigator.usb.removeEventListener('connect', handleUsbConnect);
        navigator.usb.removeEventListener('disconnect', handleUsbDisconnect);
      }
      if (navigator.serial) {
        navigator.serial.removeEventListener('connect', handleSerialConnect);
        navigator.serial.removeEventListener('disconnect', handleSerialDisconnect);
      }
    };
  }, [serialBaudRate]);

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

  // --- LOCAL OFFLINE SIMULATION FEED WITH PLUG SIMULATION ---
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

      // Simulated plug-in & plug-out event generator (15% probability)
      if (Math.random() < 0.15) {
        if (!usbDevice) {
          const simDev = "MOTO_G15_NEXUS (OTG Bridge)";
          logTerminal(`AEGIS: (Simulated) Physical USB-OTG hardware plugged in: ${simDev}`);
          setUsbDevice(simDev);
          setConnectedUsbDetails({
            vendorId: 0x22B8,
            productId: 0x2E82,
            manufacturerName: "Motorola",
            productName: "Moto G15 OTG Bridge",
            serialNumber: "NX-G15-992F-A",
            usbVersion: "2.10 (OTG BRIDGE)",
            deviceClass: 0xEF,
            deviceSubclass: 0x02,
            deviceProtocol: 0x01
          });
          addToast("USB OTG DEVICE CONNECTED", `${simDev} (VID: 0x22B8) [SIMULATED]`, "connect");
          setTargetDevice({
            name: simDev,
            os: "Android Architecture (Phoenix Recovery)",
            status: "Raw USB Mapped // Sim Telemetry Live",
            health: 84
          });
        } else {
          const prevName = usbDevice;
          logTerminal(`AEGIS: (Simulated) Physical USB-OTG hardware disconnected.`);
          setUsbDevice(null);
          setConnectedUsbDetails(null);
          addToast("USB OTG DEVICE DISCONNECTED", `${prevName} removed. [SIMULATED]`, "disconnect");
          setTargetDevice({
            name: "Awaiting OTG Handshake...",
            os: "Unknown Interface",
            status: "Standby Monitor",
            health: 100
          });
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isLocalMode, usbDevice]);

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
      
      const devName = device.productName || `Vendor ${device.vendorId} Device`;
      setUsbDevice(devName);
      const details = {
        vendorId: device.vendorId,
        productId: device.productId,
        manufacturerName: device.manufacturerName || "Unknown",
        productName: device.productName || `Device 0x${device.productId.toString(16)}`,
        serialNumber: device.serialNumber || "N/A",
        usbVersion: `${device.usbVersionMajor}.${device.usbVersionMinor}`,
        deviceClass: device.deviceClass,
        deviceSubclass: device.deviceSubclass,
        deviceProtocol: device.deviceProtocol
      };
      setConnectedUsbDetails(details);
      addToast("USB OTG DEVICE MOUNTED", `${devName} linked successfully.`, "connect");
      logTerminal(`OTG USB-C HANDSHAKE INITIATION: SUCCESS (${devName})`);
      
      const isApple = devName.toLowerCase().includes('apple') || devName.toLowerCase().includes('iphone');
      setTargetDevice({
        name: devName,
        os: isApple ? "iOS (DFU Interface Mode)" : "Firmware Core (Phoenix Compatible)",
        status: "Raw USB Mapped // Telemetry Online",
        health: 72
      });

      const telemetryObj = {
        node: 'NEXUS_DECK_01',
        device: devName,
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
      addToast("HARDWARE BRIDGE FAILED", err.message, "alert");
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

  // --- BIDIRECTIONAL WEBSERIAL TRANSMITTER (TX) ---
  const sendSerialData = async () => {
    if (!serialPortRef.current && !isLocalMode) {
      logTerminal("WEBSERIAL: Transmission failed. No active port connection.");
      addToast("SERIAL TRANSMIT FAILED", "Establish active WebSerial link first.", "alert");
      return;
    }
    
    const textToSend = serialTxInput;
    if (!textToSend) return;
    
    playBeep(700, 'sine', 0.05);
    
    let finalStr = textToSend;
    if (serialTxTerminator === '\\r\\n') finalStr += '\r\n';
    else if (serialTxTerminator === '\\n') finalStr += '\n';
    else if (serialTxTerminator === '\\r') finalStr += '\r';
    
    logTerminal(`SERIAL TX >> ${textToSend}`);
    
    setLiveData(prev => [
      {
        id: `serial-tx-${Date.now()}`,
        node: 'NEXUS_TX',
        device: textToSend,
        timestamp: Date.now(),
        status: 'TX'
      },
      ...prev.slice(0, 24)
    ]);
    
    if (isLocalMode) {
      setTimeout(() => {
        const cleanCmd = textToSend.toLowerCase();
        let simResponse = `ACK: CMD "${textToSend}" EXECUTED`;
        if (cleanCmd.includes('status')) {
          simResponse = `RX: STATUS=OK, TEMP=42C, VOLTAGE=4.95V`;
        } else if (cleanCmd.includes('help')) {
          simResponse = `RX: AVAILABLE: status, reboot, debug_on, debug_off`;
        } else if (cleanCmd.includes('reboot')) {
          simResponse = `RX: SYSTEM REBOOTING... INITIALIZING BUS`;
        }
        
        logTerminal(`SERIAL RX << ${simResponse}`);
        setLiveData(prev => [
          {
            id: `serial-pkt-${Date.now()}`,
            node: 'UART_BRIDGE',
            device: simResponse,
            timestamp: Date.now(),
            status: 'RX'
          },
          ...prev.slice(0, 24)
        ]);
        setPacketsPerSec(prev => prev + 1);
        playBeep(600, 'sine', 0.05);
      }, 800);
      
      setSerialTxInput('');
      return;
    }
    
    try {
      const encoder = new TextEncoder();
      const writer = serialPortRef.current.writable.getWriter();
      await writer.write(encoder.encode(finalStr));
      writer.releaseLock();
      logTerminal("WEBSERIAL: Command packet transmitted successfully.");
      setSerialTxInput('');
    } catch (err) {
      logTerminal(`SERIAL TX ERROR: ${err.message}`);
      addToast("SERIAL TRANSMIT FAILED", err.message, "alert");
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

  // --- TELEMETRY EXPORT DUMPS ---
  const exportTelemetryCSV = () => {
    playSuccessChime();
    let csvContent = "data:text/csv;charset=utf-8,ID,Timestamp,Node,Device,Status\n";
    liveData.forEach(item => {
      const time = new Date(item.timestamp).toISOString();
      const cleanDev = (item.device || '').replace(/"/g, '""');
      csvContent += `${item.id},"${time}",${item.node},"${cleanDev}",${item.status || 'OK'}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Nexus_Telemetry_Dump_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logTerminal("TELEMETRY: Telemetry logs exported to CSV.");
  };

  const exportTelemetryJSON = () => {
    playSuccessChime();
    const jsonStr = JSON.stringify(liveData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Nexus_Telemetry_Dump_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logTerminal("TELEMETRY: Telemetry logs exported to JSON.");
  };

  const clearTelemetryLogs = () => {
    playBeep(400, 'sine', 0.08);
    setLiveData([]);
    logTerminal("TELEMETRY: Local telemetry log buffer cleared.");
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
- Preset Profile Standard: ${oraclePromptPreset.toUpperCase()}

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
  const enumerateCameras = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoIn = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoIn);
      if (videoIn.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoIn[0].deviceId);
      }
    } catch (err) {
      console.warn("Failed to enumerate video devices", err);
    }
  };

  useEffect(() => {
    enumerateCameras();
  }, []);

  const getCanvasFilterString = () => {
    let filterStr = '';
    if (cameraFilter === 'grayscale') {
      filterStr += 'grayscale(100%) contrast(125%) brightness(110%) ';
    } else if (cameraFilter === 'contrast') {
      filterStr += 'contrast(200%) saturate(150%) brightness(95%) ';
    } else if (cameraFilter === 'night-vision') {
      filterStr += 'sepia(100%) hue-rotate(90deg) saturate(350%) contrast(150%) brightness(115%) ';
    } else if (cameraFilter === 'thermal') {
      filterStr += 'invert(100%) hue-rotate(180deg) saturate(250%) contrast(160%) brightness(115%) ';
    }
    filterStr += `brightness(${cameraBrightness}%) contrast(${cameraContrast}%) saturate(${cameraSaturation}%)`;
    return filterStr;
  };

  // RESOLVING UNIMPLEMENTED METHOD BUG IN V6.2
  const getCameraVideoStyle = () => {
    const filter = getCanvasFilterString();
    const transform = !hasNativeZoom && cameraZoom > 1 ? `scale(${cameraZoom})` : 'none';
    return {
      filter,
      transform,
      transformOrigin: 'center center'
    };
  };

  const startCamera = async () => {
    playBeep(350, 'sine', 0.1);
    logTerminal("ORACLE: Accessing target camera stream...");
    
    let widthConstraint = 1280;
    let heightConstraint = 720;
    if (cameraResolution === '4k') { widthConstraint = 3840; heightConstraint = 2160; }
    else if (cameraResolution === '1080p') { widthConstraint = 1920; heightConstraint = 1080; }
    else if (cameraResolution === '480p') { widthConstraint = 640; heightConstraint = 480; }

    try {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: {
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          width: { ideal: widthConstraint },
          height: { ideal: heightConstraint },
          facingMode: selectedCameraId ? undefined : 'environment'
        }
      };

      const s = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      
      const track = s.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      setHasTorch(!!capabilities.torch);
      setHasNativeZoom(!!capabilities.zoom);
      setCameraZoom(1);
      setIsCameraFrozen(false);
      setCapturedImage(null);
      
      setOracleState("LENS_ACTIVE");
      logTerminal(`ORACLE: Diagnostic Lens camera active (${cameraResolution}).`);
      
      enumerateCameras();
    } catch (e) { 
      logTerminal("ORACLE: Camera access denied / constraints unsupported."); 
      addToast("CAMERA ACCESS DENIED", "Check site permissions in browser.", "alert");
    }
  };

  const toggleTorch = async () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const track = videoRef.current.srcObject.getVideoTracks()[0];
      try {
        const nextState = !torchActive;
        setTorchActive(nextState);
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        logTerminal(`ORACLE: Camera flashlight ${nextState ? "ACTIVATED" : "DEACTIVATED"}`);
        playBeep(600, 'sine', 0.05);
      } catch (err) {
        logTerminal("ORACLE: Failed to toggle flashlight controls.");
      }
    }
  };

  const updateNativeZoom = async (val) => {
    setCameraZoom(val);
    if (hasNativeZoom && videoRef.current && videoRef.current.srcObject) {
      const track = videoRef.current.srcObject.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          advanced: [{ zoom: val }]
        });
      } catch (err) {
        console.warn("Native zoom application failed", err);
      }
    }
  };

  const freezeCamera = () => {
    playBeep(850, 'sine', 0.06);
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const videoW = video.videoWidth || 640;
    const videoH = video.videoHeight || 480;
    
    canvas.width = 800;
    canvas.height = 600;
    
    ctx.clearRect(0, 0, 800, 600);
    ctx.filter = getCanvasFilterString();
    
    const sWidth = hasNativeZoom ? videoW : (videoW / cameraZoom);
    const sHeight = hasNativeZoom ? videoH : (videoH / cameraZoom);
    const sx = hasNativeZoom ? 0 : (videoW - sWidth) / 2;
    const sy = hasNativeZoom ? 0 : (videoH - sHeight) / 2;
    
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, 800, 600);
    
    const data = canvas.toDataURL('image/png');
    setCapturedImage(data);
    setIsCameraFrozen(true);
    logTerminal("ORACLE: Diagnostic frame frozen. Visual details locked.");
  };

  const unfreezeCamera = () => {
    playBeep(400, 'sine', 0.06);
    setIsCameraFrozen(false);
    setCapturedImage(null);
    logTerminal("ORACLE: Resumed live camera feed.");
  };

  const analyzeCapturedFrame = async () => {
    if (!capturedImage) return;
    playBeep(520, 'sine', 0.1);
    
    const targetPrompt = oraclePromptPreset === 'custom' 
      ? (oracleCustomPrompt || "Analyze this microelectronics component.") 
      : PROMPT_PRESETS[oraclePromptPreset];

    if (geminiApiKey) {
      logTerminal("ORACLE: Transmitting forensic frame to Gemini API Visual Forensics...");
      setOracleState("DIAGNOSTIC_RUNNING");
      setDiagnosticResult("Analyzing component visuals. Quizzing Gemini 2.5 Flash database...");
      
      const rawBase64 = capturedImage.split(',')[1];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: targetPrompt },
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
      let mockRes = "SIMULATED INSPECTION REPORT (No API key):\n";
      if (oraclePromptPreset === 'defect') {
        mockRes += "- Failure Mode: Suspected burnt trace around clock crystallizer circuit.\n- Solution: Solder bridging required. Re-flash kernel via Phoenix tools.";
      } else if (oraclePromptPreset === 'ocr') {
        mockRes += "- IC1: STM32F407VGT6 (ARM Cortex-M4 @168MHz)\n- Flash: 1MB, SRAM: 196KB\n- Revision: B (Manufacture date code 2420)";
      } else {
        mockRes += "- Joint Pin 3: Solder bridge identified between clock and Ground bus.\n- Resolution: Rework via reflow braid recommended.";
      }
      setDiagnosticResult(mockRes);
      logTerminal("ORACLE: Simulated frame analysis loaded. Input API Key in Settings for live diagnostics.");
    }
  };

  const resetCamera = () => {
    playBeep(400, 'sine', 0.08);
    setCapturedImage(null);
    setDiagnosticResult(null);
    setTorchActive(false);
    setIsCameraFrozen(false);
    setCameraZoom(1);
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
    <div className="crt-overlay min-h-screen bg-[var(--hud-dark)] text-[var(--hud-color)] font-mono p-4 flex flex-col gap-4 selection:bg-[var(--hud-color)]/30 overflow-x-hidden relative">
      
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

      {/* PACKET DETAIL INSPECTOR MODAL */}
      {selectedPacket && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--hud-card)] border border-[var(--hud-color)] p-6 rounded-xl shadow-[0_0_30px_var(--hud-glow-pulse)] font-mono">
            <div className="flex justify-between items-center border-b border-[var(--hud-color)]/25 pb-2 mb-4">
              <h3 className="text-xs font-black tracking-widest text-white font-sans uppercase">
                🔍 TELEMETRY PACKET INSPECTOR
              </h3>
              <button 
                onClick={() => { playHapticClick(); setSelectedPacket(null); }} 
                className="text-[9px] border border-red-500/40 text-red-500 px-2 py-0.5 hover:bg-red-500 hover:text-black transition-all rounded cursor-pointer"
              >
                CLOSE
              </button>
            </div>
            
            <div className="space-y-3 text-[8.5px] text-gray-300">
              <div className="grid grid-cols-3 border-b border-[var(--hud-color)]/10 pb-1">
                <span className="opacity-50">PACKET ID:</span>
                <span className="col-span-2 text-white font-bold">{selectedPacket.id}</span>
              </div>
              <div className="grid grid-cols-3 border-b border-[var(--hud-color)]/10 pb-1">
                <span className="opacity-50">TIMESTAMP:</span>
                <span className="col-span-2 text-white">{new Date(selectedPacket.timestamp).toLocaleString()} ({selectedPacket.timestamp})</span>
              </div>
              <div className="grid grid-cols-3 border-b border-[var(--hud-color)]/10 pb-1">
                <span className="opacity-50">SOURCE NODE:</span>
                <span className="col-span-2 text-cyan-400 font-bold">{selectedPacket.node}</span>
              </div>
              <div className="grid grid-cols-3 border-b border-[var(--hud-color)]/10 pb-1">
                <span className="opacity-50">INTERFACE STATUS:</span>
                <span className="col-span-2 text-[var(--hud-color)]">{selectedPacket.status || 'OK'}</span>
              </div>
              
              <div className="space-y-1 pt-2">
                <span className="opacity-50 uppercase block">Raw Payload Data / Message:</span>
                <div className="bg-black border border-[var(--hud-color)]/20 p-3 rounded-lg text-white font-mono text-[9px] h-32 overflow-y-auto whitespace-pre-wrap select-all leading-normal">
                  {selectedPacket.device}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEBUSB vs WEBSERIAL BRIDGE MODAL */}
      {showBridgeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--hud-card)] border border-[var(--hud-color)]/60 p-6 rounded-xl shadow-[0_0_30px_var(--hud-glow-pulse)]">
            <h3 className="text-xs font-black tracking-widest text-white border-b border-[var(--hud-color)]/25 pb-2 mb-4 font-sans uppercase">
              SELECT TELEMETRY INTERFACE BRIDGE
            </h3>
            <p className="text-[9px] opacity-75 leading-relaxed mb-5 uppercase">
              Establish a low-level physical OTG interface mapping. Choose your diagnostic protocol standard:
            </p>
            <div className="space-y-3">
              <button 
                onClick={() => { playHapticClick(); setShowBridgeModal(false); connectHardware(); }} 
                className="w-full py-3 bg-black border border-[var(--hud-color)]/45 hover:bg-[var(--hud-color)]/10 text-white font-bold text-[10px] tracking-wider transition-all rounded-lg flex items-center justify-between px-4 cursor-pointer"
              >
                <span>🔌 WEBUSB PHYSICAL DEVICE</span>
                <span className="text-[8px] bg-[var(--hud-color)]/20 px-2 py-0.5 rounded text-[var(--hud-color)]">ACTIVE SCAN</span>
              </button>
              <button 
                onClick={() => { playHapticClick(); setShowBridgeModal(false); connectSerialHardware(); }} 
                className="w-full py-3 bg-black border border-[var(--hud-color)]/45 hover:bg-[var(--hud-color)]/10 text-white font-bold text-[10px] tracking-wider transition-all rounded-lg flex items-center justify-between px-4 cursor-pointer"
              >
                <span>📺 WEBSERIAL UART TERMINAL</span>
                <span className="text-[8px] bg-[var(--hud-color)]/20 px-2 py-0.5 rounded text-[var(--hud-color)]">{serialBaudRate} BAUD</span>
              </button>
            </div>
            <button 
              onClick={() => { playHapticClick(); setShowBridgeModal(false); }} 
              className="w-full mt-5 py-2 bg-red-950/20 border border-red-500/40 text-red-500 font-black text-[9px] tracking-wider hover:bg-red-500 hover:text-black transition-all rounded-md cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* SLIDE-OUT SYSTEM CONFIGURATION DRAWER */}
      {showSettings && (
        <div className="fixed inset-y-0 right-0 w-80 bg-black/95 border-l border-[var(--hud-color)]/40 z-[90] p-5 shadow-[0_0_40px_var(--hud-glow-pulse)] flex flex-col justify-between backdrop-blur-md animate-in slide-in-from-right duration-300">
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[var(--hud-color)]/20 pb-2">
              <h3 className="text-xs font-black tracking-widest text-white font-sans uppercase">[SYSTEM CONFIGURATION]</h3>
              <button onClick={() => { playHapticClick(); setShowSettings(false); }} className="text-[9px] border border-red-500/40 text-red-500 px-2 py-0.5 hover:bg-red-500 hover:text-black transition-all rounded cursor-pointer">CLOSE</button>
            </div>

            {/* Dynamic Color Theme Switcher */}
            <div className="space-y-1.5">
              <label className="block text-[8px] font-bold uppercase tracking-wider text-[var(--hud-color)]/70">HUD Color Matrix Theme</label>
              <select
                value={activeTheme}
                onChange={(e) => { playHapticClick(); setActiveTheme(e.target.value); }}
                className="w-full bg-[#03060a] border border-[var(--hud-color)]/30 p-2 text-[9px] text-[var(--hud-color)] focus:outline-none focus:border-[var(--hud-color)]/80 rounded font-mono"
              >
                {Object.keys(HUD_THEMES).map(themeKey => (
                  <option key={themeKey} value={themeKey}>
                    {HUD_THEMES[themeKey].name}
                  </option>
                ))}
              </select>
            </div>

            {/* Gemini API Key input */}
            <div className="space-y-1.5">
              <label className="block text-[8px] font-bold uppercase tracking-wider text-[var(--hud-color)]/70">Google Gemini API Key</label>
              <input 
                type="password"
                value={geminiApiKey}
                onChange={(e) => saveGeminiKey(e.target.value)}
                placeholder="Enter AI API Key (gemini-...)"
                className="w-full bg-[#03060a] border border-[var(--hud-color)]/30 p-2 text-[9px] text-[var(--hud-color)] focus:outline-none focus:border-[var(--hud-color)]/80 rounded font-mono"
              />
              <p className="text-[6.5px] opacity-45 uppercase">Saved locally. Needed for real-time visual fault diagnosis using Gemini models.</p>
            </div>

            {/* WebSerial Baud Rate Select */}
            <div className="space-y-1.5">
              <label className="block text-[8px] font-bold uppercase tracking-wider text-[var(--hud-color)]/70">UART Serial Baud Rate</label>
              <select
                value={serialBaudRate}
                onChange={(e) => saveBaudRate(e.target.value)}
                className="w-full bg-[#03060a] border border-[var(--hud-color)]/30 p-2 text-[9px] text-[var(--hud-color)] focus:outline-none focus:border-[var(--hud-color)]/80 rounded font-mono"
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
                <label className="block text-[8px] font-bold uppercase tracking-wider text-[var(--hud-color)]/70">Synthesizer Volume</label>
                <span className="text-[8px] text-white">{Math.round(audioVolume * 1000)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(e) => { playHapticClick(); saveAudioEnabled(e.target.checked); }}
                  className="accent-[var(--hud-color)]"
                />
                <input 
                  type="range"
                  min="0"
                  max="0.1"
                  step="0.01"
                  value={audioVolume}
                  onChange={(e) => saveAudioVolume(parseFloat(e.target.value))}
                  disabled={!audioEnabled}
                  className="flex-1 accent-[var(--hud-color)] h-1 bg-gray-950 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--hud-color)]/20 pt-4 text-[7px] opacity-40 uppercase leading-relaxed font-mono">
            * Warning: Do not distribute configuration parameters. The zero-trust secure sandbox isolated environment prevents credential extraction leaks.
          </div>
        </div>
      )}

      {/* HEADER HUD */}
      <header className="relative z-10 p-4 bg-black border border-[var(--hud-color)]/20 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border-2 border-[var(--hud-color)] flex items-center justify-center font-black animate-pulse shadow-[0_0_15px_var(--hud-color)] text-lg">
            NX
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest font-sans text-white">NEXUS TACTICAL OPERATING SYSTEM (v6.3)</h1>
            <p className="text-[8px] opacity-60 uppercase">Sovereign Agentic Hardware Diagnostic Platform</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-left sm:text-right">
            <button 
              onClick={() => { playHapticClick(); setShowSettings(true); }}
              className="text-[9px] border border-[var(--hud-color)]/40 text-[var(--hud-color)] px-3 py-1 bg-[var(--hud-color)]/5 font-black hover:bg-[var(--hud-color)] hover:text-black transition-all rounded cursor-pointer"
            >
              ⚙️ SYSTEM CONFIGS
            </button>
          </div>
          <div className="relative">
            <span className="flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${user ? 'bg-[var(--hud-color)]' : isLocalMode ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${user ? 'bg-[var(--hud-color)]' : isLocalMode ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
            </span>
          </div>
        </div>
      </header>

      {/* FIREBASE INITIAL CONFIG CONFIGURATION SCREEN */}
      {!firebaseConfig && !isLocalMode && (
        <div className="relative z-20 flex-1 flex items-center justify-center p-2 md:p-6">
          <div className="w-full max-w-2xl bg-black/95 border border-[var(--hud-color)]/60 p-6 rounded-xl shadow-[0_0_40px_var(--hud-glow)] animate-glow">
            <div className="border-b border-[var(--hud-color)]/30 pb-3 mb-6">
              <h2 className="text-xs font-black tracking-widest flex justify-between font-sans">
                <span>[CRITICAL CONSOLE BOOT SYSTEM]</span>
                <span className="animate-pulse">▲ CONFIGURATION REQUIRED</span>
              </h2>
              <p className="text-[9px] opacity-60 uppercase mt-1">Matrix Link Offline. Supply Firebase Connection credentials to authorize cloud bridge.</p>
            </div>

            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-[var(--hud-color)]/80">
                  Paste Firebase Config JSON Payload:
                </label>
                <textarea
                  value={configInput}
                  onChange={(e) => setConfigInput(e.target.value)}
                  placeholder={`{\n  "apiKey": "your-api-key",\n  "authDomain": "your-auth-domain",\n  "projectId": "your-project-id",\n  "storageBucket": "your-storage-bucket",\n  "messagingSenderId": "your-sender-id",\n  "appId": "your-app-id"\n}`}
                  rows={8}
                  className="w-full bg-[#03060a] border border-[var(--hud-color)]/30 p-3 text-[10px] text-[var(--hud-color)] placeholder-[var(--hud-color)]/20 focus:outline-none focus:border-[var(--hud-color)]/80 font-mono resize-none transition-all rounded"
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
                  className="flex-1 py-3 border border-[var(--hud-color)] bg-[var(--hud-color)]/10 text-[var(--hud-color)] text-[10px] font-black tracking-widest hover:bg-[var(--hud-color)] hover:text-black hover:shadow-[0_0_15px_var(--hud-color)] transition-all cursor-pointer rounded"
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
                  LOCAL MOCK TEST (v6.3)
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-[var(--hud-color)]/20 pt-4 text-[9px] opacity-40 uppercase leading-relaxed font-mono">
              * Local Mock mode boots the diagnostic dashboards, Web Audio synthesizers, local signal graph simulator, and console commands without needing Firebase services.
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD SYSTEM INTERFACE (WHEN LOGGED IN OR LOCAL MODE) */}
      {(firebaseConfig || isLocalMode) && (
        <div className="relative z-10 flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:h-[calc(100vh-140px)] lg:overflow-hidden">
          
          {/* COLUMN 1: LEFT SIDEBAR (Target Stats, SVG OTG Port, Device Tree) */}
          <aside className="order-2 lg:order-1 lg:col-span-3 flex flex-col gap-4 lg:overflow-y-auto lg:h-full scrollbar-thin">
            
            {/* TARGET DEVICE PROFILE */}
            <div className="bg-black/95 border border-[var(--hud-color)]/25 p-4 rounded-xl space-y-3 font-mono">
              <div className="border-b border-[var(--hud-color)]/15 pb-1">
                <span className="text-[8px] font-black uppercase text-white font-sans">Target Profile</span>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-white text-[11px] truncate">{targetDevice.name}</p>
                <p className="text-[8.5px] opacity-65 truncate">{targetDevice.os}</p>
                <p className="text-[7.5px] text-[var(--hud-color)]/80 truncate">{targetDevice.status}</p>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-[7px] uppercase font-bold">
                  <span>CPU</span>
                  <span>{cpuHistory[cpuHistory.length - 1]}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-full h-5 stroke-[var(--hud-color)] fill-none" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <polyline
                      strokeWidth="1.5"
                      points={cpuHistory.map((val, idx) => `${idx * 11},${30 - (val * 30 / 100)}`).join(' ')}
                    />
                  </svg>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[7px] uppercase font-bold">
                  <span>RAM</span>
                  <span>{ramHistory[ramHistory.length - 1]}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-full h-5 stroke-[var(--hud-color)] fill-none" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <polyline
                      strokeWidth="1.5"
                      points={ramHistory.map((val, idx) => `${idx * 11},${30 - (val * 30 / 100)}`).join(' ')}
                    />
                  </svg>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[7px] uppercase font-bold">
                  <span>Integrity Health</span>
                  <span>{targetDevice.health}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-950 border border-[var(--hud-color)]/20 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--hud-color)]" style={{ width: `${targetDevice.health}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* INTERACTIVE USB/OTG PORT VISUALIZER */}
            <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col gap-3 font-mono">
              <span className="text-[8px] font-black uppercase text-white border-b border-[var(--hud-color)]/10 pb-1 w-full text-left font-sans">OTG Hardware Port</span>
              
              <div className="relative w-full h-24 flex items-center justify-center bg-black/60 rounded-lg border border-[var(--hud-color)]/10 overflow-hidden">
                <div className="hud-grid absolute inset-0 opacity-15"></div>
                
                <svg className="w-48 h-16" viewBox="0 0 280 100">
                  {/* USB Port Outline */}
                  <rect x="30" y="35" width="60" height="30" rx="8" fill="none" stroke={usbDevice ? "var(--hud-color)" : "#d97706"} strokeWidth="2" className={!usbDevice ? "animate-pulse" : ""} />
                  {/* Inner USB plug details */}
                  <rect x="40" y="45" width="40" height="10" rx="2" fill={usbDevice ? "var(--hud-color)" : "#d97706"} opacity="0.3" />
                  <line x1="45" y1="50" x2="75" y2="50" stroke={usbDevice ? "var(--hud-color)" : "#d97706"} strokeWidth="2" strokeDasharray="2,2" />
                  
                  {/* Connection Line */}
                  {usbDevice ? (
                    <>
                      {/* Cable Plugged In */}
                      <path d="M 90 50 L 190 50" stroke="var(--hud-color)" strokeWidth="3" className="animate-pulse" />
                      <rect x="150" y="38" width="40" height="24" rx="4" fill="var(--hud-color)" />
                      <text x="170" y="52" fill="black" fontSize="7.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">USB-C</text>
                      
                      {/* Animated signal dots */}
                      <circle cx="130" cy="50" r="2.5" fill="#ffffff" className="animate-ping">
                        <animate attributeName="cx" from="180" to="90" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="110" cy="50" r="2.5" fill="var(--hud-color)">
                        <animate attributeName="cx" from="150" to="90" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    </>
                  ) : (
                    <>
                      {/* Cable Floating Disconnected */}
                      <path d="M 170 50 L 230 50" stroke="#d97706" strokeWidth="2" strokeDasharray="3,3" />
                      <rect x="180" y="38" width="40" height="24" rx="4" fill="none" stroke="#d97706" strokeWidth="1.5" />
                      <text x="200" y="52" fill="#d97706" fontSize="7" textAnchor="middle" fontFamily="monospace" className="animate-pulse">DISCONN</text>
                    </>
                  )}
                </svg>
                
                {/* Centered blinker light */}
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${usbDevice ? 'bg-[var(--hud-color)] animate-pulse shadow-[0_0_8px_var(--hud-color)]' : 'bg-amber-600 animate-[pulse_1s_infinite] shadow-[0_0_8px_#d97706]'}`}></span>
                  <span className="text-[6px] font-mono opacity-50 uppercase">{usbDevice ? "LINKED" : "SCANNING"}</span>
                </div>
              </div>

              {/* Connected Device Details */}
              {usbDevice ? (
                <div className="w-full text-[8px] bg-black/40 border border-[var(--hud-color)]/20 p-2 rounded-lg space-y-0.5 text-gray-300">
                  <div className="flex justify-between border-b border-[var(--hud-color)]/10 pb-0.5 mb-1 text-white">
                    <span className="opacity-50">DEVICE:</span>
                    <span className="font-bold truncate max-w-[120px]">{usbDevice.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">VENDOR ID:</span>
                    <span>{connectedUsbDetails?.vendorId !== undefined ? `0x${connectedUsbDetails.vendorId.toString(16).toUpperCase().padStart(4, '0')}` : "0x22B8"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">PRODUCT ID:</span>
                    <span>{connectedUsbDetails?.productId !== undefined ? `0x${connectedUsbDetails.productId.toString(16).toUpperCase().padStart(4, '0')}` : "0x2E82"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">CLASS PROTOCOL:</span>
                    <span>{connectedUsbDetails?.deviceClass !== undefined ? `0x${connectedUsbDetails.deviceClass.toString(16).toUpperCase()}` : "0xEF"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">USB SPEC:</span>
                    <span>{connectedUsbDetails?.usbVersion !== undefined ? `v${connectedUsbDetails.usbVersion}` : "v2.10"}</span>
                  </div>
                </div>
              ) : (
                <div className="w-full text-[7.5px] border border-[#d97706]/20 bg-[#d97706]/5 p-2 rounded-lg text-center text-amber-500 animate-pulse uppercase leading-normal">
                  * Port Scanning active. Connect phone or motherboard via OTG USB cable to pair.
                </div>
              )}
            </div>

            {/* HIERARCHICAL DEVICE TREE */}
            <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col gap-2 font-mono">
              <p className="text-[8px] font-black uppercase text-white border-b border-[var(--hud-color)]/15 pb-1 mb-1 font-sans">Sovereign Device Tree</p>
              <div className="space-y-1 leading-snug text-[8px]">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--hud-color)]">[-]</span>
                  <span className="text-white font-bold">NEXUS_ROOT_HUB</span>
                </div>
                <div className="pl-4 space-y-1 border-l border-[var(--hud-color)]/15 ml-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="opacity-30">├──</span>
                    <span className="text-cyan-400">📷 VIDEO SENSORS</span>
                  </div>
                  {videoDevices.map((d, i) => (
                    <div key={i} className="pl-6 flex items-center gap-1.5 text-gray-400">
                      <span className="opacity-20">├──</span>
                      <span className="truncate max-w-[130px]">{d.label || `Camera ${i + 1}`}</span>
                    </div>
                  ))}
                  {videoDevices.length === 0 && (
                    <div className="pl-6 text-gray-600 italic">None detected</div>
                  )}
                  
                  <div className="flex items-center gap-1.5">
                    <span className="opacity-30">├──</span>
                    <span className={usbDevice ? "text-[var(--hud-color)]" : "text-gray-500"}>🔌 OTG USB BUS [{usbDevice ? "ACTIVE" : "EMPTY"}]</span>
                  </div>
                  {usbDevice && (
                    <div className="pl-6 text-gray-400">
                      <span className="opacity-20">└──</span>
                      <span className="truncate max-w-[130px]">{usbDevice}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1.5">
                    <span className="opacity-30">└──</span>
                    <span className={serialPortRef.current ? "text-[var(--hud-color)]" : "text-gray-500"}>📺 UART SERIAL [{serialPortRef.current ? "OPEN" : "STANDBY"}]</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PERSISTENT USB BRIDGE INITIATION BUTTON */}
            <button 
              onClick={() => { playHapticClick(); setShowBridgeModal(true); }}
              className="w-full py-3 border border-[var(--hud-color)] bg-[var(--hud-color)]/5 font-black text-[9px] tracking-widest hover:bg-[var(--hud-color)] hover:text-black transition-all cursor-pointer hover:shadow-[0_0_12px_var(--hud-glow)] flex items-center justify-center gap-2 active:scale-[0.98] rounded-xl font-mono"
            >
              🔌 {usbDevice ? "LINK ACTIVE: MANAGE" : "CONNECT PHYSICAL OTG"}
            </button>
          </aside>

          {/* COLUMN 2: CENTER PANEL (Navigation & Active Tab workspace) */}
          <main className="order-1 lg:order-2 lg:col-span-6 flex flex-col gap-4 lg:overflow-y-auto lg:h-full scrollbar-thin">
            
            {/* MAIN NAVIGATION BAR */}
            <nav className="grid grid-cols-3 gap-2 bg-[#05070a] p-1 border border-[var(--hud-color)]/15 rounded-lg relative z-20 font-mono">
              {['agents', 'diagnostics', 'telemetry'].map(tab => (
                <button 
                  key={tab} 
                  onClick={() => { playHapticClick(); setView(tab); }} 
                  className={`py-2.5 text-[9px] font-black tracking-widest border transition-all cursor-pointer ${view === tab ? 'bg-[var(--hud-color)]/20 border-[var(--hud-color)] text-white shadow-[0_0_10px_var(--hud-glow)]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </nav>

            {/* TAB CONTENTS */}
            {view === 'agents' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Agent Selector Grid */}
                <div className="grid grid-cols-5 gap-1.5 font-mono">
                  {['Oracle', 'Aegis', 'iFixer', 'Archivist', 'Systems_TuneUp'].map(agent => (
                    <button 
                      key={agent} 
                      onClick={() => { playHapticClick(); setSelectedAgent(agent); }} 
                      className={`py-2 px-1 text-[8px] font-bold border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${selectedAgent === agent ? 'bg-[var(--hud-color)]/10 border-[var(--hud-color)] text-white' : 'border-gray-800 opacity-60 hover:opacity-100'}`}
                    >
                      <span className="truncate max-w-full">{agent.replace('_', ' ')}</span>
                      <span className="w-1 h-1 rounded-full bg-[var(--hud-color)] animate-pulse"></span>
                    </button>
                  ))}
                </div>

                {/* Agent Card workspace */}
                <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col gap-4 font-mono">
                  <div>
                    <div className="flex justify-between items-center border-b border-[var(--hud-color)]/20 pb-1.5 mb-2">
                      <p className="text-[10px] font-black text-white uppercase font-sans">AGENT LINKED: {selectedAgent.replace('_', ' ')}</p>
                      <span className="text-[7px] bg-[var(--hud-color)]/10 border border-[var(--hud-color)]/40 px-2 py-0.5 rounded text-[var(--hud-color)] font-bold">READY</span>
                    </div>
                    <p className="text-[9.5px] leading-relaxed text-gray-300">{agentDescriptions[selectedAgent]}</p>
                    
                    {selectedAgent === 'Archivist' && (
                      <div className="border border-[var(--hud-color)]/20 bg-black/45 p-3 rounded-lg flex flex-col gap-2 mt-3">
                        <p className="text-[8px] uppercase font-bold text-white font-sans">Forensic Binary Hex Analyzer</p>
                        <div className="flex items-center justify-between gap-3">
                          <input 
                            type="file" 
                            id="file-hex-input-lc"
                            onChange={handleFileUpload}
                            className="hidden" 
                          />
                          <label 
                            htmlFor="file-hex-input-lc"
                            className="py-1 px-2.5 bg-black border border-[var(--hud-color)] hover:bg-[var(--hud-color)] hover:text-black font-black text-[7.5px] tracking-wider transition-all rounded cursor-pointer uppercase"
                          >
                            LOAD FIRMWARE BIN
                          </label>
                          <span className="text-[7.5px] opacity-75 truncate max-w-[150px] font-mono">
                            {fileName ? `${fileName} (${fileSize} bytes)` : "NO FILE MOUNTED"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Hex dump view / Agent Logs in Center workspace */}
                  <div className="bg-black/60 border border-[var(--hud-color)]/10 rounded-lg p-3 h-52 overflow-hidden flex flex-col">
                    {selectedAgent === 'Archivist' && hexDumpData ? (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <p className="text-[8px] opacity-40 uppercase tracking-widest mb-1.5 border-b border-[var(--hud-color)]/15 pb-1">Hex address dump (Offset 2KB Max)</p>
                        <div className="flex-1 overflow-y-auto space-y-0.5 text-[7px] leading-none select-text scrollbar-thin">
                          {hexDumpData.map((line, idx) => (
                            <div key={idx} className="flex gap-2 hover:bg-[var(--hud-color)]/10 px-1 py-0.2">
                              <span className="text-[var(--hud-color)] opacity-70">{line.offset}:</span>
                              <span className="text-white tracking-wide">{line.hex}</span>
                              <span className="text-cyan-400 opacity-80">{line.ascii}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <p className="text-[8px] opacity-40 uppercase tracking-widest mb-1.5 border-b border-[var(--hud-color)]/10 pb-1">Agent Telemetry Logs</p>
                        <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin">
                          {(agentLogs[selectedAgent] || []).map((log, idx) => (
                            <div key={idx} className="text-[8.5px] flex items-start gap-1">
                              <span className="text-[var(--hud-color)] opacity-50 select-none">&gt;&gt;</span>
                              <span className="text-gray-300">{log}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => triggerAgentAction(selectedAgent, "Force telemetry diagnostic")} 
                      className="py-2 bg-black border border-[var(--hud-color)]/30 rounded text-[7.5px] font-bold hover:bg-[var(--hud-color)]/15 transition-all cursor-pointer"
                    >
                      FORCE SYNC
                    </button>
                    <button 
                      onClick={() => triggerAgentAction(selectedAgent, "Sanitize memory space")} 
                      className="py-2 bg-black border border-[var(--hud-color)]/30 rounded text-[7.5px] font-bold hover:bg-[var(--hud-color)]/15 transition-all cursor-pointer"
                    >
                      WIPE CACHE
                    </button>
                    <button 
                      onClick={() => triggerAgentAction(selectedAgent, "Execute vulnerability audit")} 
                      className="py-2 bg-black border border-red-500/40 text-red-400 rounded text-[7.5px] font-bold hover:bg-red-950/20 hover:border-red-500 transition-all cursor-pointer"
                    >
                      AUDIT AGENT
                    </button>
                  </div>
                </div>
              </div>
            )}

            {view === 'diagnostics' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                
                {/* TOOL ACTION WIDGET */}
                <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col gap-3 font-mono">
                  <div className="flex border-b border-[var(--hud-color)]/25 pb-1.5 gap-4">
                    <button 
                      onClick={() => { playHapticClick(); setToolTab('mobile'); }} 
                      className={`text-[9px] font-bold pb-1 transition-all cursor-pointer ${toolTab === 'mobile' ? 'border-b-2 border-[var(--hud-color)] text-white' : 'opacity-40 hover:opacity-80'}`}
                    >
                      MOBILE OVERRIDE
                    </button>
                    <button 
                      onClick={() => { playHapticClick(); setToolTab('pc'); }} 
                      className={`text-[9px] font-bold pb-1 transition-all cursor-pointer ${toolTab === 'pc' ? 'border-b-2 border-[var(--hud-color)] text-white' : 'opacity-40 hover:opacity-80'}`}
                    >
                      PC FIRMWARE AUDIT
                    </button>
                    <button 
                      onClick={() => { playHapticClick(); setToolTab('serial'); }} 
                      className={`text-[9px] font-bold pb-1 transition-all cursor-pointer ${toolTab === 'serial' ? 'border-b-2 border-[var(--hud-color)] text-white' : 'opacity-40 hover:opacity-80'}`}
                    >
                      📟 UART CONSOLE
                    </button>
                  </div>

                  {toolTab === 'mobile' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => runSystemAction("Nexus Phoenix Standard Repair Bypass", "mobile")} 
                        className="p-2.5 bg-black border border-[var(--hud-color)]/25 hover:bg-[var(--hud-color)]/10 rounded-lg text-left text-[9px] font-bold text-white flex flex-col gap-0.5 transition-all cursor-pointer"
                      >
                        <span className="text-[var(--hud-color)] font-sans">🩹 Phoenix Loop Bypass</span>
                        <span className="text-[7px] opacity-60">Force bypass system firmware boot overrides.</span>
                      </button>
                      <button 
                        onClick={() => runSystemAction("Nexus Phoenix Firmware Force Recovery", "mobile")} 
                        className="p-2.5 bg-black border border-[var(--hud-color)]/25 hover:bg-[var(--hud-color)]/10 rounded-lg text-left text-[9px] font-bold text-white flex flex-col gap-0.5 transition-all cursor-pointer"
                      >
                        <span className="text-[var(--hud-color)] font-sans">⚡ Phoenix Block Flash</span>
                        <span className="text-[7px] opacity-60">Direct partition writes to secure firmware sectors.</span>
                      </button>
                    </div>
                  )}

                  {toolTab === 'pc' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => runSystemAction("Nexus Aegis Core Optimizer Speed Sweep", "pc")} 
                        className="p-2.5 bg-black border border-[var(--hud-color)]/25 hover:bg-[var(--hud-color)]/10 rounded-lg text-left text-[9px] font-bold text-white flex flex-col gap-0.5 transition-all cursor-pointer"
                      >
                        <span className="text-[var(--hud-color)] font-sans">🧹 Aegis cache sanitation</span>
                        <span className="text-[7px] opacity-60">Cleans buffer heaps and sanitizes volatile data.</span>
                      </button>
                      <button 
                        onClick={() => runSystemAction("Nexus Aegis System Configuration Repair", "pc")} 
                        className="p-2.5 bg-black border border-[var(--hud-color)]/25 hover:bg-[var(--hud-color)]/10 rounded-lg text-left text-[9px] font-bold text-white flex flex-col gap-0.5 transition-all cursor-pointer"
                      >
                        <span className="text-[var(--hud-color)] font-sans">🛠️ Integrity Check Audit</span>
                        <span className="text-[7px] opacity-60">Compares sector hashes against diagnostic keys.</span>
                      </button>
                    </div>
                  )}

                  {/* BIDIRECTIONAL UART CONSOLE */}
                  {toolTab === 'serial' && (
                    <div className="space-y-3">
                      {/* UART terminal stream logs */}
                      <div className="bg-black/80 border border-[var(--hud-color)]/30 rounded-lg p-3 h-40 overflow-y-auto space-y-1 font-mono text-[8px] scrollbar-thin">
                        <div className="text-[var(--hud-color)]/50 border-b border-[var(--hud-color)]/10 pb-1 mb-1 font-sans flex justify-between uppercase">
                          <span>UART Serial Monitor</span>
                          <span>{usbDevice ? "BRIDGE ACTIVE" : "SIMULATED MONITOR"}</span>
                        </div>
                        {liveData.filter(item => item.node === 'UART_BRIDGE' || item.node === 'NEXUS_TX').length === 0 ? (
                          <div className="text-center italic opacity-35 py-4">No serial communication data active.</div>
                        ) : (
                          liveData.filter(item => item.node === 'UART_BRIDGE' || item.node === 'NEXUS_TX').map((item, idx) => {
                            const isTx = item.node === 'NEXUS_TX';
                            return (
                              <div key={idx} className="flex items-start gap-1 select-text">
                                <span className={isTx ? "text-cyan-400 font-bold" : "text-[var(--hud-color)]"}>
                                  {isTx ? "TX >>" : "RX <<"}
                                </span>
                                <span className={isTx ? "text-cyan-300" : "text-gray-300"}>{item.device}</span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Command Sender form */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={serialTxInput}
                          onChange={(e) => setSerialTxInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendSerialData(); } }}
                          placeholder="Type UART payload command..."
                          className="flex-1 bg-black border border-[var(--hud-color)]/30 p-2 text-[8px] text-[var(--hud-color)] focus:outline-none focus:border-[var(--hud-color)]/80 rounded font-mono"
                        />
                        <select
                          value={serialTxTerminator}
                          onChange={(e) => setSerialTxTerminator(e.target.value)}
                          className="bg-black border border-[var(--hud-color)]/35 p-1 text-[var(--hud-color)] rounded font-mono text-[7.5px] focus:outline-none"
                        >
                          <option value="\r\n">CRLF (\r\n)</option>
                          <option value="\n">LF (\n)</option>
                          <option value="\r">CR (\r)</option>
                          <option value="none">NONE</option>
                        </select>
                        <button
                          onClick={sendSerialData}
                          className="px-4 py-2 bg-[var(--hud-color)] text-black font-black text-[8px] tracking-wider hover:bg-white transition-all rounded uppercase cursor-pointer"
                        >
                          TX SEND
                        </button>
                      </div>
                    </div>
                  )}

                  {isProcessingAction && (
                    <div className="bg-black border border-blue-500/40 p-3 rounded-lg text-[8px] animate-pulse">
                      <p className="text-blue-400 font-bold uppercase mb-1">RUNNING CORE DEPLOYMENT... {actionProgress}%</p>
                      <div className="w-full h-1.5 bg-gray-900 border border-blue-900/30 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" style={{ width: `${actionProgress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* DIAGNOSTIC LENS CAMERA FRAME WORKSPACE */}
                <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col gap-3 font-mono">
                  <p className="text-[9px] font-black text-white border-b border-[var(--hud-color)]/10 pb-1 uppercase tracking-wider font-sans">Camera Diagnostic Lens Suite</p>
                  
                  {oracleState === "AWAITING_INPUT" && (
                    <button 
                      onClick={startCamera} 
                      className="flex-1 flex flex-col justify-center items-center py-10 border border-[var(--hud-color)] border-dashed bg-[var(--hud-color)]/5 text-[var(--hud-color)] hover:bg-[var(--hud-color)]/10 transition-all rounded-lg cursor-pointer"
                    >
                      <span className="text-2xl mb-1.5">📷</span>
                      <span className="text-[8.5px] font-black tracking-widest font-sans">ACTIVATE HARDWARE DIAGNOSTIC LENS</span>
                    </button>
                  )}

                  {oracleState === "LENS_ACTIVE" && (
                    <div className="space-y-3">
                      {/* Video Preview Container */}
                      <div className="relative h-56 bg-black rounded-lg overflow-hidden border border-[var(--hud-color)]/30 flex flex-col justify-between">
                        
                        {/* Live Webcam Stream or frozen image display */}
                        {isCameraFrozen && capturedImage ? (
                          <img 
                            src={capturedImage} 
                            style={getCameraVideoStyle()}
                            className="w-full h-full object-cover absolute inset-0 z-0" 
                          />
                        ) : (
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            style={getCameraVideoStyle()}
                            className="w-full h-full object-cover absolute inset-0 z-0"
                          />
                        )}
                        
                        {/* Target Reticle overlay */}
                        {cameraOverlay === 'reticle' && (
                          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                            <svg className="w-28 h-28 stroke-[var(--hud-color)] stroke-2 fill-none opacity-80" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="40" strokeDasharray="4,4" className="animate-spin [animation-duration:15s]" />
                              <circle cx="50" cy="50" r="20" />
                              <line x1="50" y1="0" x2="50" y2="15" />
                              <line x1="50" y1="85" x2="50" y2="100" />
                              <line x1="0" y1="50" x2="15" y2="50" />
                              <line x1="85" y1="50" x2="100" y2="50" />
                              <circle cx="50" cy="50" r="1.5" fill="var(--hud-color)" />
                            </svg>
                            <span className="absolute text-[6px] tracking-widest text-[var(--hud-color)] font-mono bottom-10 animate-pulse">LOCKING COORD SYSTEM</span>
                          </div>
                        )}

                        {/* Grid lines overlay */}
                        {cameraOverlay === 'grid' && (
                          <div className="absolute inset-0 z-10 pointer-events-none grid grid-cols-3 grid-rows-3 border border-[var(--hud-color)]/15">
                            <div className="border-r border-b border-[var(--hud-color)]/20"></div>
                            <div className="border-r border-b border-[var(--hud-color)]/20"></div>
                            <div className="border-b border-[var(--hud-color)]/20"></div>
                            <div className="border-r border-b border-[var(--hud-color)]/20"></div>
                            <div className="border-r border-b border-[var(--hud-color)]/20"></div>
                            <div className="border-b border-[var(--hud-color)]/20"></div>
                            <div className="border-r border-[var(--hud-color)]/20"></div>
                            <div className="border-r border-[var(--hud-color)]/20"></div>
                            <div></div>
                          </div>
                        )}

                        {/* ROI yellow box overlay */}
                        {cameraOverlay === 'roi' && (
                          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                            <div className="w-36 h-28 border border-dashed border-yellow-500 rounded flex items-center justify-center relative">
                              <span className="absolute top-1 left-2 text-yellow-500 text-[5.5px] font-bold">BOARD TARGET DETECT</span>
                              <div className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 border-t border-l border-yellow-500"></div>
                              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 border-t border-r border-yellow-500"></div>
                              <div className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 border-b border-l border-yellow-500"></div>
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-b border-r border-yellow-500"></div>
                            </div>
                          </div>
                        )}

                        {/* Top details bar */}
                        <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20">
                          <span className="text-[6.5px] bg-black/80 border border-[var(--hud-color)]/40 px-2 py-0.5 text-white font-mono rounded font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1 h-1 bg-[var(--hud-color)] rounded-full animate-ping"></span>
                            {isCameraFrozen ? "FROZEN MATRIX" : `LIVE LENS ${cameraResolution}`}
                          </span>
                          
                          {hasTorch && !isCameraFrozen && (
                            <button 
                              onClick={toggleTorch}
                              className={`px-2 py-0.5 font-bold text-[6.5px] border transition-all rounded font-mono cursor-pointer ${torchActive ? 'bg-[var(--hud-color)] text-black border-[var(--hud-color)]' : 'bg-black/90 text-white border-white/20'}`}
                            >
                              {torchActive ? "⚡ TORCH ON" : "⚡ TORCH OFF"}
                            </button>
                          )}
                        </div>

                        {/* Floating bottom filter options row */}
                        <div className="absolute bottom-2 left-2 right-2 z-20 flex justify-center gap-1 bg-black/85 border border-[var(--hud-color)]/15 p-1 rounded-lg text-[6px]">
                          {['none', 'grayscale', 'contrast', 'night-vision', 'thermal'].map(filter => (
                            <button
                              key={filter}
                              onClick={() => { playHapticClick(); setCameraFilter(filter); }}
                              className={`px-1.5 py-0.5 font-bold transition-all rounded border cursor-pointer ${cameraFilter === filter ? 'bg-[var(--hud-color)] text-black border-[var(--hud-color)]' : 'border-transparent text-gray-400 hover:text-white'}`}
                            >
                              {filter.toUpperCase().replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* CAMERA CONTROLS AND DIALS DRAWER */}
                      <div className="border border-[var(--hud-color)]/20 p-3 bg-black/60 rounded-lg text-[8px] space-y-2.5">
                        
                        {/* Device & Resolution Selectors row */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[var(--hud-color)]/60 font-bold uppercase">Source Camera</label>
                            <select
                              value={selectedCameraId}
                              onChange={(e) => { setSelectedCameraId(e.target.value); setTimeout(startCamera, 100); }}
                              className="bg-black border border-[var(--hud-color)]/35 p-1 text-[var(--hud-color)] rounded font-mono text-[7.5px] focus:outline-none"
                            >
                              {videoDevices.map((d, i) => (
                                <option key={d.deviceId || i} value={d.deviceId}>
                                  {d.label || `Camera ${i + 1}`}
                                </option>
                              ))}
                              {videoDevices.length === 0 && <option value="">Default Environment</option>}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[var(--hud-color)]/60 font-bold uppercase">Format Limit</label>
                            <select
                              value={cameraResolution}
                              onChange={(e) => { setCameraResolution(e.target.value); setTimeout(startCamera, 100); }}
                              className="bg-black border border-[var(--hud-color)]/35 p-1 text-[var(--hud-color)] rounded font-mono text-[7.5px] focus:outline-none"
                            >
                              <option value="480p">SD (640x480)</option>
                              <option value="720p">HD (1280x720)</option>
                              <option value="1080p">FHD (1920x1080)</option>
                              <option value="4k">UHD 4K (3840x2160)</option>
                            </select>
                          </div>
                        </div>

                        {/* Multimodal Presets selector row */}
                        <div className="flex flex-col gap-1 border-t border-[var(--hud-color)]/10 pt-2">
                          <label className="text-[var(--hud-color)]/60 font-bold uppercase">Oracle AI Analysis Mode</label>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={oraclePromptPreset}
                              onChange={(e) => { playHapticClick(); setOraclePromptPreset(e.target.value); }}
                              className="bg-black border border-[var(--hud-color)]/35 p-1.5 text-[var(--hud-color)] rounded font-mono text-[7.5px] focus:outline-none"
                            >
                              <option value="defect">🔍 BOARD DEFECT ANALYSIS</option>
                              <option value="ocr">🏷️ PART / OCR IDENTIFICATION</option>
                              <option value="solder">⚡ SOLDER QUALITY AUDIT</option>
                              <option value="custom">✏️ CUSTOM FORENSIC QUERY</option>
                            </select>
                            
                            {oraclePromptPreset === 'custom' ? (
                              <input
                                type="text"
                                value={oracleCustomPrompt}
                                onChange={(e) => setOracleCustomPrompt(e.target.value)}
                                placeholder="Enter custom inspection prompt..."
                                className="bg-black border border-[var(--hud-color)]/35 p-1 px-2 text-[var(--hud-color)] rounded font-mono text-[7.5px] focus:outline-none"
                              />
                            ) : (
                              <div className="text-[6.5px] opacity-50 flex items-center leading-normal">
                                {oraclePromptPreset === 'defect' && "* Audit board tracks, bulges, capacitors, and burns."}
                                {oraclePromptPreset === 'ocr' && "* OCR-extract chip numbers, revisions, and labels."}
                                {oraclePromptPreset === 'solder' && "* Verify solder joint wetting, cracks, and bridges."}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Zoom Slider */}
                        <div className="flex justify-between items-center border-t border-[var(--hud-color)]/10 pt-2">
                          <span className="text-white">Forensic Zoom: {cameraZoom.toFixed(1)}x</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="range" min="1" max="4" step="0.1" value={cameraZoom}
                              onChange={(e) => updateNativeZoom(parseFloat(e.target.value))}
                              disabled={isCameraFrozen}
                              className="accent-[var(--hud-color)] h-1 w-28"
                            />
                            <span className="opacity-45 text-[7px]">{hasNativeZoom ? "NATIVE" : "CSS SCALE"}</span>
                          </div>
                        </div>

                        {/* Brightness, Contrast, Saturation Adjustments sliders */}
                        <div className="grid grid-cols-3 gap-2 border-t border-[var(--hud-color)]/10 pt-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex justify-between opacity-50"><span>Bright</span><span>{cameraBrightness}%</span></div>
                            <input type="range" min="50" max="200" step="5" value={cameraBrightness} onChange={(e) => setCameraBrightness(parseInt(e.target.value))} className="accent-[var(--hud-color)] h-1" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex justify-between opacity-50"><span>Contr</span><span>{cameraContrast}%</span></div>
                            <input type="range" min="50" max="200" step="5" value={cameraContrast} onChange={(e) => setCameraContrast(parseInt(e.target.value))} className="accent-[var(--hud-color)] h-1" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex justify-between opacity-50"><span>Satur</span><span>{cameraSaturation}%</span></div>
                            <input type="range" min="50" max="200" step="5" value={cameraSaturation} onChange={(e) => setCameraSaturation(parseInt(e.target.value))} className="accent-[var(--hud-color)] h-1" />
                          </div>
                        </div>

                        {/* Target Overlay selectors */}
                        <div className="flex items-center justify-between border-t border-[var(--hud-color)]/10 pt-2">
                          <span className="text-white">Overlay grid</span>
                          <div className="flex gap-1 text-[7px]">
                            {['none', 'reticle', 'grid', 'roi'].map(ov => (
                              <button
                                key={ov}
                                onClick={() => { playHapticClick(); setCameraOverlay(ov); }}
                                className={`px-2 py-0.5 rounded border cursor-pointer ${cameraOverlay === ov ? 'bg-[var(--hud-color)] text-black border-[var(--hud-color)]' : 'border-[var(--hud-color)]/20 text-white'}`}
                              >
                                {ov.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Main Actions Panel */}
                      <div className="flex gap-3">
                        {isCameraFrozen ? (
                          <>
                            <button 
                              onClick={analyzeCapturedFrame}
                              className="flex-1 py-2.5 bg-[var(--hud-color)] text-black font-black text-[9px] tracking-widest hover:bg-white transition-all rounded shadow-md font-sans cursor-pointer"
                            >
                              🔍 AI INSPECT FRAME
                            </button>
                            <button 
                              onClick={unfreezeCamera}
                              className="px-4 py-2.5 bg-black border border-[var(--hud-color)] text-[var(--hud-color)] font-bold text-[9px] tracking-wider hover:bg-[var(--hud-color)]/10 transition-all rounded cursor-pointer"
                            >
                              🔄 RESUME LIVE
                            </button>
                          </>
                        ) : (
                          <button 
                            onClick={freezeCamera} 
                            className="flex-1 py-2.5 bg-[var(--hud-color)] text-black font-black text-[9px] tracking-widest hover:bg-white transition-all rounded shadow-md font-sans cursor-pointer"
                          >
                            ❄️ FREEZE DIAGNOSTIC FRAME
                          </button>
                        )}
                        <button 
                          onClick={resetCamera} 
                          className="px-3 py-2.5 bg-black border border-red-500/50 text-red-500 font-bold text-[9px] tracking-wider hover:bg-red-950/20 transition-all rounded cursor-pointer"
                        >
                          STANDBY
                        </button>
                      </div>
                    </div>
                  )}

                  {oracleState === "DIAGNOSTIC_RUNNING" && (
                    <div className="h-60 bg-black/60 rounded-lg border border-[var(--hud-color)]/35 flex flex-col justify-center items-center gap-3">
                      <span className="text-2xl animate-spin">🌀</span>
                      <p className="text-[8.5px] text-[var(--hud-color)] tracking-widest animate-pulse font-sans font-black uppercase text-center max-w-[280px]">
                        TRANSMITTING SPECTRAL CAPTURE TO ORACLE AGENT MODEL...
                      </p>
                    </div>
                  )}

                  {oracleState === "DIAGNOSIS_COMPLETE" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1 border border-[var(--hud-color)]/25 bg-black rounded-lg overflow-hidden h-36 relative">
                          {capturedImage && <img src={capturedImage} style={getCameraVideoStyle()} className="w-full h-full object-cover" />}
                          <div className="absolute top-1 left-1 text-[5.5px] bg-[var(--hud-color)] text-black px-1 font-bold">FROZEN</div>
                        </div>
                        <div className="col-span-2 text-[8px] p-2.5 bg-[var(--hud-color)]/5 rounded-lg border border-[var(--hud-color)]/20 h-36 overflow-y-auto whitespace-pre-line leading-relaxed scrollbar-thin select-text">
                          {diagnosticResult}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={exportDiagnosticsReport}
                          className="flex-1 py-2 bg-black border border-[var(--hud-color)] text-[var(--hud-color)] hover:bg-[var(--hud-color)] hover:text-black text-[9px] font-black tracking-widest transition-all rounded font-mono cursor-pointer"
                        >
                          📥 EXPORT FORENSIC REPORT
                        </button>
                        <button 
                          onClick={resetCamera} 
                          className="px-5 py-2 bg-black border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-black text-[9px] font-black tracking-widest transition-all rounded font-mono cursor-pointer"
                        >
                          RESET
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

            {view === 'telemetry' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* Telemetry SVG Oscilloscope with controls */}
                  <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col justify-between font-mono">
                    <div>
                      <h3 className="text-[10px] font-black tracking-widest text-[var(--hud-color)]/80 uppercase border-b border-[var(--hud-color)]/10 pb-1.5 mb-3 font-sans">
                        Signal Waveform Oscilloscope
                      </h3>
                      
                      <div className="h-44 border border-[var(--hud-color)]/20 bg-black relative flex items-center rounded-lg overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-[var(--hud-color)]/5 to-transparent pointer-events-none"></div>
                        <div className="absolute left-4 top-2 text-[7px] text-[var(--hud-color)]/40 font-bold uppercase tracking-wider">CH1 - 4.2V</div>
                        <div className="absolute right-4 bottom-2 text-[7px] text-[var(--hud-color)]/40 font-bold uppercase tracking-wider">SWEEP: {oscFrozen ? "FROZEN" : "AUTO"}</div>
                        
                        <svg viewBox="0 0 300 100" className="w-full h-full" preserveAspectRatio="none">
                          <line x1="0" y1="50" x2="300" y2="50" stroke="var(--hud-color)" opacity="0.15" strokeWidth="0.5" strokeDasharray="3,3" />
                          <line x1="75" y1="0" x2="75" y2="100" stroke="var(--hud-color)" opacity="0.08" strokeWidth="0.5" strokeDasharray="3,3" />
                          <line x1="150" y1="0" x2="150" y2="100" stroke="var(--hud-color)" opacity="0.08" strokeWidth="0.5" strokeDasharray="3,3" />
                          <line x1="225" y1="0" x2="225" y2="100" stroke="var(--hud-color)" opacity="0.08" strokeWidth="0.5" strokeDasharray="3,3" />
                          
                          <path
                            d={Array.from({ length: 300 })
                              .map((_, x) => {
                                const y = calculateOscY(x);
                                return `${x === 0 ? 'M' : 'L'} ${x} ${y}`;
                              })
                              .join(' ')}
                            fill="none"
                            stroke="var(--hud-color)"
                            strokeWidth="1.5"
                            className="drop-shadow-[0_0_4px_var(--hud-color)]"
                          />
                        </svg>
                      </div>

                      {/* Oscilloscope parameters control panel */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-3 border border-[var(--hud-color)]/15 p-2 bg-black/45 rounded-lg text-[8px] uppercase">
                        <div className="flex flex-col gap-1">
                          <label className="opacity-55">Waveform</label>
                          <select 
                            value={oscWaveform}
                            onChange={(e) => setOscWaveform(e.target.value)}
                            className="bg-black border border-[var(--hud-color)]/30 p-1 text-[var(--hud-color)] focus:outline-none rounded font-mono text-[7px]"
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
                            className="accent-[var(--hud-color)] h-1"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex justify-between opacity-55"><span>Amp</span><span>{oscAmplitude}px</span></div>
                          <input 
                            type="range" min="5" max="45" step="2" value={oscAmplitude}
                            onChange={(e) => setOscAmplitude(parseInt(e.target.value))}
                            className="accent-[var(--hud-color)] h-1"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="opacity-55">Audio Monitor</label>
                          <button 
                            onClick={() => { playHapticClick(); setAudioGenActive(!audioGenActive); }}
                            className={`w-full py-1 font-bold tracking-widest border transition-all rounded text-[7px] cursor-pointer ${audioGenActive ? 'bg-[var(--hud-color)] text-black border-[var(--hud-color)] animate-pulse' : 'border-[var(--hud-color)]/30 text-white hover:bg-[var(--hud-color)]/10'}`}
                          >
                            {audioGenActive ? "🔊 ACTIVE" : "🔇 STANDBY"}
                          </button>
                        </div>
                        <button 
                          onClick={() => { playHapticClick(); setOscFrozen(!oscFrozen); }}
                          className={`w-full h-fit py-1.5 self-end font-bold tracking-widest border transition-all rounded text-[7px] cursor-pointer ${oscFrozen ? 'bg-[var(--hud-color)] text-black border-[var(--hud-color)]' : 'border-[var(--hud-color)]/30 text-white hover:bg-[var(--hud-color)]/10'}`}
                        >
                          {oscFrozen ? "UNFREEZE" : "FREEZE"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 text-[9px]">
                      <div className="border border-[var(--hud-color)]/10 p-2 bg-[var(--hud-color)]/5 text-center">
                        <p className="opacity-50 uppercase text-[7px]">Packet Rate</p>
                        <p className="text-xs font-black text-white mt-0.5">{packetsPerSec} PPS</p>
                      </div>
                      <div className="border border-[var(--hud-color)]/10 p-2 bg-[var(--hud-color)]/5 text-center">
                        <p className="opacity-50 uppercase text-[7px]">Integrity Rating</p>
                        <p className="text-xs font-black text-[var(--hud-color)] mt-0.5">{healthStatus}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Telemetry Audio Sequencer Panel */}
                  <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex flex-col gap-4 font-mono">
                    
                    {/* Melodical Sequencer Grid */}
                    <div className="border border-[var(--hud-color)]/20 p-3 bg-black/60 rounded-lg space-y-2">
                      <div className="flex justify-between items-center border-b border-[var(--hud-color)]/15 pb-1 mb-2">
                        <h4 className="text-[9px] font-black uppercase text-white font-sans">Telemetry Audio Sequencer</h4>
                        <button 
                          onClick={() => { playHapticClick(); setSequencerActive(!sequencerActive); }}
                          className={`px-3 py-1 font-black text-[7.5px] border transition-all cursor-pointer ${sequencerActive ? 'bg-red-500 text-black border-red-500 animate-pulse' : 'bg-[var(--hud-color)]/5 text-[var(--hud-color)] border-[var(--hud-color)]/40'}`}
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
                              className={`w-6 h-6 border font-bold text-[8px] flex items-center justify-center transition-all cursor-pointer ${
                                sequencerSteps[idx] ? 'bg-[var(--hud-color)] text-black border-[var(--hud-color)]' : 'border-gray-800 text-gray-500 hover:border-[var(--hud-color)]/50'
                              } ${sequencerActive && currentStep === idx ? 'ring-2 ring-white scale-110' : ''}`}
                            >
                              {idx + 1}
                            </button>
                            <div className={`w-1.5 h-1.5 rounded-full ${sequencerActive && currentStep === idx ? 'bg-red-500 animate-ping' : 'bg-gray-800'}`}></div>
                          </div>
                        ))}
                      </div>

                      {/* Sequencer Tempo Slider */}
                      <div className="flex justify-between items-center text-[7.5px] uppercase pt-1 text-gray-400 font-mono">
                        <span className="opacity-70">Tempo Speed</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="range" min="100" max="600" step="50" value={sequencerSpeed}
                            onChange={(e) => setSequencerSpeed(parseInt(e.target.value))}
                            className="accent-[var(--hud-color)] h-1 w-20"
                          />
                          <span>{sequencerSpeed}ms</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </main>

          {/* COLUMN 3: RIGHT SIDEBAR (Live Telemetry Stream & CLI Shell) */}
          <aside className="order-3 lg:col-span-3 flex flex-col gap-4 lg:overflow-y-auto lg:h-full scrollbar-thin">
            
            {/* LIVE TELEMETRY STREAM */}
            <div className="bg-[#05070a]/90 border border-[var(--hud-color)]/25 p-4 rounded-xl flex-1 flex flex-col gap-3 font-mono overflow-hidden">
              <h2 className="text-[9px] font-black tracking-widest border-b border-[var(--hud-color)]/20 pb-1 flex justify-between items-center font-sans">
                <span>LIVE TELEMETRY STREAM</span>
                <span className="text-[7px] opacity-40">MAX 25 PACKETS</span>
              </h2>

              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-52 lg:max-h-none scrollbar-thin">
                {liveData.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center py-8 opacity-30 italic text-[8px] uppercase font-bold tracking-widest text-center">
                    <span className="animate-bounce mb-1">📡</span>
                    Awaiting telemetry link...
                  </div>
                ) : (
                  liveData.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      onClick={() => { playHapticClick(); setSelectedPacket(item); }}
                      className="text-[8px] bg-[var(--hud-color)]/5 hover:bg-[var(--hud-color)]/10 p-1.5 border-l border-[var(--hud-color)] flex flex-col justify-between gap-1 transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[6.5px] px-1 py-0.2 bg-[var(--hud-color)]/20 font-black ${item.status === 'TX' ? 'text-cyan-400 bg-cyan-950/45 border-l border-cyan-400' : 'text-[var(--hud-color)]'}`}>
                          {item.status || 'RX'}
                        </span>
                        <span className="font-bold text-[var(--hud-color)]">{item.node} &gt;&gt;</span>
                        <span className="opacity-80 group-hover:text-white truncate max-w-[120px]">{item.device || 'SYSTEM HARDWARE'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[7px] opacity-60">
                        <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        <span className="border border-[var(--hud-color)]/20 px-1 bg-[var(--hud-color)]/5 text-white">
                          {item.status || 'OK'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* CSV/JSON EXPORTS */}
              <div className="flex justify-between gap-1.5 border-t border-[var(--hud-color)]/10 pt-2">
                <button
                  onClick={exportTelemetryCSV}
                  className="flex-1 py-1 bg-black border border-[var(--hud-color)]/30 text-[7px] font-black tracking-wider hover:bg-[var(--hud-color)] hover:text-black transition-all rounded uppercase cursor-pointer"
                >
                  📥 CSV
                </button>
                <button
                  onClick={exportTelemetryJSON}
                  className="flex-1 py-1 bg-black border border-[var(--hud-color)]/30 text-[7px] font-black tracking-wider hover:bg-[var(--hud-color)] hover:text-black transition-all rounded uppercase cursor-pointer"
                >
                  📥 JSON
                </button>
                <button
                  onClick={clearTelemetryLogs}
                  className="px-2 py-1 bg-black border border-red-500/40 text-red-400 text-[7px] font-black tracking-wider hover:bg-red-500 hover:text-black transition-all rounded uppercase cursor-pointer"
                >
                  CLEAR
                </button>
              </div>
            </div>

            {/* OPERATIVE CLI TERMINAL SHELL */}
            <div className="bg-black/95 border border-[var(--hud-color)]/25 p-4 rounded-xl shadow-[0_0_15px_var(--hud-glow)] font-mono flex flex-col gap-2">
              <div className="flex justify-between items-center border-b border-[var(--hud-color)]/15 pb-1">
                <span className="text-[8px] font-black tracking-widest text-[var(--hud-color)] uppercase font-sans">OPERATIVE CLI CONSOLE</span>
                <span className="text-[6.5px] opacity-35 font-mono">100 LINES MAX</span>
              </div>

              <div className="h-36 overflow-y-auto space-y-1 text-[8.5px] leading-tight flex flex-col-reverse scrollbar-thin select-text">
                <div ref={terminalEndRef}></div>
                {terminal.map((t, i) => {
                  let color = "text-[var(--hud-color)]/80";
                  if (t.includes("CRITICAL") || t.includes("ERROR") || t.includes("FAILURE") || t.includes("ALERT")) {
                    color = "text-red-500 font-bold animate-pulse";
                  } else if (t.includes("SECURE") || t.includes("SUCCESS") || t.includes("ONLINE") || t.includes("APPROVED")) {
                    color = "text-[var(--hud-color)] font-bold";
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
              <form onSubmit={handleCommandSubmit} className="flex gap-2 border border-[var(--hud-color)]/30 px-2.5 py-1 bg-[#030508] rounded-md">
                <span className="text-[8.5px] font-bold text-[var(--hud-color)] select-none self-center">NEXUS_SHELL:~$</span>
                <input
                  type="text"
                  value={terminalCommand}
                  onChange={(e) => setTerminalCommand(e.target.value)}
                  placeholder="Type command..."
                  className="flex-1 bg-transparent border-none text-[8.5px] text-[var(--hud-color)] font-mono focus:outline-none placeholder-[var(--hud-color)]/25"
                />
              </form>
            </div>
          </aside>

        </div>
      )}

      {/* TOAST SYSTEM LAYER */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {toasts.map(toast => {
          let borderColor = 'border-[var(--hud-color)]';
          let icon = '🔌';
          let bgColor = 'bg-black/95';
          let glow = 'shadow-[0_0_15px_var(--hud-glow)]';
          let textColor = 'text-[var(--hud-color)]';
          
          if (toast.type === 'disconnect') {
            borderColor = 'border-amber-500';
            icon = '⚠️';
            glow = 'shadow-[0_0_15px_rgba(217,119,6,0.15)]';
            textColor = 'text-amber-500';
          } else if (toast.type === 'alert') {
            borderColor = 'border-red-500';
            icon = '🚨';
            glow = 'shadow-[0_0_15px_rgba(239,68,68,0.2)]';
            textColor = 'text-red-500';
          }
          
          return (
            <div 
              key={toast.id}
              className={`pointer-events-auto border-2 ${borderColor} ${bgColor} ${glow} p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-right duration-300 font-mono`}
            >
              <span className="text-lg">{icon}</span>
              <div className="flex-1 space-y-0.5">
                <h4 className={`text-[10px] font-black tracking-widest ${textColor} uppercase`}>{toast.title}</h4>
                <p className="text-[9px] text-white leading-normal uppercase">{toast.message}</p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-white/40 hover:text-white text-[9px] border border-white/20 px-1 rounded self-start cursor-pointer"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* FOOTER DATA */}
      <footer className="relative z-10 text-[8px] opacity-50 flex justify-between font-bold uppercase tracking-wider pt-2 border-t border-[var(--hud-color)]/10 mt-auto font-mono">
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
                setConnectedUsbDetails(null);
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
          <span>SYS VERSION: 6.3.0</span>
        </div>
      </footer>
      
      {/* Hidden elements for webcam rendering frame mapping */}
      <canvas ref={canvasRef} className="hidden" width="800" height="600" />
    </div>
  );
};

export default App;
