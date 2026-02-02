import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  ConfigProvider,
  Layout,
  Button,
  Select,
  Switch,
  Slider,
  ColorPicker,
  Modal,
  Tabs,
  Menu,
  Card,
  Tag,
  Typography,
  theme as antTheme,
  Flex,
  Form,
  Input,
  InputNumber,
  Radio,
  Empty,
  Tooltip,
} from "antd";
import {
  AudioOutlined,
  TranslationOutlined,
  WindowsOutlined,
  CloseOutlined,
  SettingOutlined,
  DesktopOutlined,
  AppstoreOutlined,
  PlayCircleOutlined,
  StopOutlined,
  SunOutlined,
  MoonOutlined,
  DragOutlined,
  DownloadOutlined,
  MinusOutlined,
  BorderOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

type ServerMsg =
  | {
      type: "asr.partial" | "asr.final";
      text: string;
      trans?: string;
      id?: string;
      seq: number;
      is_final: boolean;
      asr_mode?: string;
    }
  | { type: "asr.translate"; id: string; trans: string }
  | { type: "error"; error: string }
  | { type: "pong" };

const FRAME_BYTES = 1280;
const FRAME_INTERVAL_MS = 40;

function wsUrlDefault() {
  return "";
}

export default function App() {
  // 检查是否处于悬浮窗模式
  const [isFloatMode] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("mode") === "float";
  });

  // 主题模式：'system' | 'light' | 'dark'
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">(
    "system",
  );

  // 系统当前是否为深色
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true; // 默认暗色
  });

  const [uiEdition, setUiEdition] = useState<"user" | "geek">(
    () => (localStorage.getItem("livesub_uiEdition") as any) || "user",
  );

  // 监听系统主题变化
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    // 兼容性处理
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  // 最终应用的主题
  const isDark = themeMode === "system" ? systemIsDark : themeMode === "dark";

  const [floatData, setFloatData] = useState<{
    caption: string;
    transCaption: string;
    history: { text: string; trans?: string; id: string }[];
    settings: {
      fontSize: number;
      fontColor: string;
      bgColor: string;
      bgOpacity: number;
      maxLines: number;
      positionMode: string;
    };
  } | null>(null);

  const [wsUrl, setWsUrl] = useState(wsUrlDefault);
  const [status, setStatus] = useState("就绪");
  const [caption, setCaption] = useState("等待识别...");
  const [transCaption, setTransCaption] = useState("");
  const [history, setHistory] = useState<
    { text: string; trans?: string; id: string }[]
  >([]);
  const lastFinalTextRef = useRef("");
  const [running, setRunning] = useState(false);

  // UI 设置状态
  const [sourceLang, setSourceLang] = useState(() => localStorage.getItem("livesub_sourceLang") || "autominor");
  const [asrMode, setAsrMode] = useState(() => localStorage.getItem("livesub_asrMode") || "xfyun");
  const [translateEnabled, setTranslateEnabled] = useState(() => localStorage.getItem("livesub_translateEnabled") === "true");
  const [translateTarget, setTranslateTarget] = useState(() => localStorage.getItem("livesub_translateTarget") || "中文 (简体)");

  // 持久化辅助函数
  useEffect(() => localStorage.setItem("livesub_sourceLang", sourceLang), [sourceLang]);
  useEffect(() => localStorage.setItem("livesub_asrMode", asrMode), [asrMode]);
  useEffect(() => localStorage.setItem("livesub_translateEnabled", String(translateEnabled)), [translateEnabled]);
  useEffect(() => localStorage.setItem("livesub_translateTarget", translateTarget), [translateTarget]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsMenu, setActiveSettingsMenu] = useState("asr_local");
  const [offlineConfigVendor, setOfflineConfigVendor] = useState("local");
  const [onlineConfigVendor, setOnlineConfigVendor] = useState("xfyun");
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("livesub_settings");
    const defaults = {
      whisperBaseUrl: "http://127.0.0.1:2022/v1",
      xfAppId: "",
      xfApiKey: "",
      xfApiSecret: "",
      azureKey: "",
      azureRegion: "",
      tencentSecretId: "",
      tencentSecretKey: "",
      llmBaseUrl: "https://api.openai.com/v1",
      llmApiKey: "",
      llmModel: "gpt-3.5-turbo",
    };
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  });

  useEffect(() => localStorage.setItem("livesub_uiEdition", uiEdition), [uiEdition]);
  useEffect(() => {
    if (uiEdition === "user") {
      if (activeSettingsMenu !== "asr_local") setActiveSettingsMenu("asr_local");
      if (asrMode !== "local" && asrMode !== "whisper") setAsrMode("local");
    }
  }, [uiEdition]);

  const handleSettingsSave = (values: any) => {
    setSettings(values);
    localStorage.setItem("livesub_settings", JSON.stringify(values));
    setShowSettings(false);
    console.log("Settings saved and persisted:", values);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollTop(scrollTop > 200);
    // Show "Back to Current" if we are not at the bottom (more than 100px away)
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // 悬浮窗设置
  const [showFloatingWindow, setShowFloatingWindow] = useState(() => localStorage.getItem("livesub_showFloatingWindow") === "true");
  const [floatFontSize, setFloatFontSize] = useState(() => Number(localStorage.getItem("livesub_floatFontSize")) || 24);
  const [floatFontColor, setFloatFontColor] = useState(() => localStorage.getItem("livesub_floatFontColor") || "#FFFFFF");
  const [floatBgColor, setFloatBgColor] = useState(() => localStorage.getItem("livesub_floatBgColor") || "#000000");
  const [floatBgOpacity, setFloatBgOpacity] = useState(() => Number(localStorage.getItem("livesub_floatBgOpacity")) || 0.6);
  const [floatMaxLines, setFloatMaxLines] = useState(() => Number(localStorage.getItem("livesub_floatMaxLines")) || 2);
  const [floatPositionMode, setFloatPositionMode] = useState(() => localStorage.getItem("livesub_floatPositionMode") || "bottom"); // 'bottom', 'top', 'custom'
  const [floatPos, setFloatPos] = useState({ x: 100, y: 100 });

  // 悬浮窗持久化
  useEffect(() => localStorage.setItem("livesub_showFloatingWindow", String(showFloatingWindow)), [showFloatingWindow]);
  useEffect(() => localStorage.setItem("livesub_floatFontSize", String(floatFontSize)), [floatFontSize]);
  useEffect(() => localStorage.setItem("livesub_floatFontColor", floatFontColor), [floatFontColor]);
  useEffect(() => localStorage.setItem("livesub_floatBgColor", floatBgColor), [floatBgColor]);
  useEffect(() => localStorage.setItem("livesub_floatBgOpacity", String(floatBgOpacity)), [floatBgOpacity]);
  useEffect(() => localStorage.setItem("livesub_floatMaxLines", String(floatMaxLines)), [floatMaxLines]);
  useEffect(() => localStorage.setItem("livesub_floatPositionMode", floatPositionMode), [floatPositionMode]);

  // 悬浮窗数据同步逻辑 (主窗口发送，悬浮窗接收)
  useEffect(() => {
    if (isFloatMode) {
      // 悬浮窗模式：监听数据更新
      const handler = (data: any) => {
        setFloatData(data);
      };
      (window as any).rtcaptions?.on("float-data-updated", handler);
    } else {
      // 主窗口模式：监听悬浮窗关闭事件以同步 UI 状态
      const closeHandler = () => {
        setShowFloatingWindow(false);
      };
      (window as any).rtcaptions?.on("float-window-closed", closeHandler);

      // 主窗口模式：当状态变化时发送给悬浮窗
      if (showFloatingWindow) {
        (window as any).rtcaptions?.send("update-float-data", {
          caption,
          transCaption,
          history,
          settings: {
            fontSize: floatFontSize,
            fontColor: floatFontColor,
            bgColor: floatBgColor,
            bgOpacity: floatBgOpacity,
            maxLines: floatMaxLines,
            positionMode: floatPositionMode,
          },
        });
      }
    }
  }, [
    isFloatMode,
    showFloatingWindow,
    caption,
    transCaption,
    history,
    floatFontSize,
    floatFontColor,
    floatBgColor,
    floatBgOpacity,
    floatMaxLines,
    floatPositionMode,
  ]);

  // 处理独立窗口的开启和关闭
  useEffect(() => {
    if (isFloatMode) return;

    const toggleFloat = () => {
      if (showFloatingWindow) {
        if ((window as any).rtcaptions) {
          (window as any).rtcaptions.send("open-float");
        }
      } else {
        (window as any).rtcaptions?.send("close-float");
      }
    };

    // 延迟一小会儿执行，确保 preload 脚本注入完成
    const timer = setTimeout(toggleFloat, 500);
    return () => clearTimeout(timer);
  }, [showFloatingWindow, isFloatMode]);

  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const spRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sendTimerRef = useRef<any>(null);

  // 音频缓存管理
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const pcmBytesRef = useRef(0);
  const byteBufRef = useRef<Uint8Array>(new Uint8Array(0));

  // 向缓存队列中添加音频字节
  const pushPcmBytes = useCallback((bytes: Uint8Array) => {
    pcmChunksRef.current.push(bytes);
    pcmBytesRef.current += bytes.length;
  }, []);

  // 从缓存队列中提取指定数量的字节
  const shiftPcmBytes = useCallback((byteCount: number) => {
    if (pcmBytesRef.current < byteCount) return null;
    const out = new Uint8Array(byteCount);
    let offset = 0;
    while (offset < byteCount) {
      const head = pcmChunksRef.current[0];
      const need = byteCount - offset;
      if (head.length <= need) {
        out.set(head, offset);
        offset += head.length;
        pcmChunksRef.current.shift();
      } else {
        out.set(head.subarray(0, need), offset);
        pcmChunksRef.current[0] = head.subarray(need);
        offset += need;
      }
    }
    pcmBytesRef.current -= byteCount;
    return out;
  }, []);

  // 当翻译设置变化时通知后端
  useEffect(() => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "config",
          source_lang: sourceLang,
          asr_mode: asrMode,
          translate_enabled: translateEnabled,
          translate_target: translateTarget,
          whisper_url: settings.whisperBaseUrl,
          xf_app_id: settings.xfAppId,
          xf_api_key: settings.xfApiKey,
          xf_api_secret: settings.xfApiSecret,
          azure_key: settings.azureKey,
          azure_region: settings.azureRegion,
          tencent_secret_id: settings.tencentSecretId,
          tencent_secret_key: settings.tencentSecretKey,
          llm_url: settings.llmBaseUrl,
          llm_api_key: settings.llmApiKey,
          llm_model: settings.llmModel,
        }),
      );
    }
  }, [
    sourceLang,
    asrMode,
    translateEnabled,
    translateTarget,
    settings.whisperBaseUrl,
    settings.xfAppId,
    settings.xfApiKey,
    settings.xfApiSecret,
    settings.azureKey,
    settings.azureRegion,
    settings.tencentSecretId,
    settings.tencentSecretKey,
    settings.llmBaseUrl,
    settings.llmApiKey,
    settings.llmModel,
  ]);

  // 停止采集和识别
  const stop = useCallback(() => {
    setRunning(false);
    setStatus("已停止");
    if (sendTimerRef.current) {
      clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    // 关闭 WebSocket
    if (socketRef.current) {
      try {
        socketRef.current.send(JSON.stringify({ type: "stop" }));
      } catch {}
      try {
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }
    // 关闭音频上下文和处理器
    if (spRef.current) {
      try {
        spRef.current.disconnect();
      } catch {}
      spRef.current.onaudioprocess = null;
      spRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    // 停止媒体轨道
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    // 重置缓存
    pcmChunksRef.current = [];
    pcmBytesRef.current = 0;
    byteBufRef.current = new Uint8Array(0);
  }, []);

  // 启动音频发送循环（定时向后端发送音频帧）
  const startSendLoop = useCallback(() => {
    if (sendTimerRef.current) clearInterval(sendTimerRef.current);
    sendTimerRef.current = setInterval(() => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const frame = shiftPcmBytes(FRAME_BYTES);
      if (!frame) return;
      try {
        ws.send(frame);
      } catch {}
    }, FRAME_INTERVAL_MS);
  }, [shiftPcmBytes]);

  // 连接后端 WebSocket
  const connectWs = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      setStatus("连接后端...");
      if (!wsUrl || !wsUrl.trim()) {
        setStatus("未配置后端地址");
        reject(new Error("未配置后端地址"));
        return;
      }
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      socketRef.current = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("连接后端超时"));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        setStatus("已连接");
        // 连接成功后立即发送初始配置
        ws.send(
          JSON.stringify({
            type: "config",
            source_lang: sourceLang,
            asr_mode: asrMode,
            translate_enabled: translateEnabled,
            translate_target: translateTarget,
            whisper_url: settings.whisperBaseUrl,
            xf_app_id: settings.xfAppId,
            xf_api_key: settings.xfApiKey,
            xf_api_secret: settings.xfApiSecret,
            azure_key: settings.azureKey,
            azure_region: settings.azureRegion,
            tencent_secret_id: settings.tencentSecretId,
            tencent_secret_key: settings.tencentSecretKey,
            llm_url: settings.llmBaseUrl,
            llm_api_key: settings.llmApiKey,
            llm_model: settings.llmModel,
          }),
        );

        startSendLoop();
        resolve();
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        let msg: ServerMsg | null = null;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (!msg) return;
        // 更新字幕内容
        if (msg.type === "asr.partial" || msg.type === "asr.final") {
          let text = msg.text || "";
          const trans = msg.trans || "";

          // 去掉口语助词/语气助词
          const fillerRegex =
            /^(啊|嗯|呃|哎|唉|那个|就是|所谓的|然后)+[，。！？、]?/g;
          text = text.replace(fillerRegex, "").trim();

          // 如果过滤后变为空，且不是 final 消息，则不更新
          if (!text && msg.type !== "asr.final") return;

          // 处理标点符号错位问题
          const puncRegex = /^[，。！？；：、]/;
          if (puncRegex.test(text)) {
            const punc = text.match(puncRegex)![0];
            setHistory((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + punc },
              ];
            });
            text = text.substring(1).trim();
          }

          if (msg.type === "asr.final") {
            if (text.trim()) {
              const msgId = msg.id || String(Date.now());
              setHistory((prev) => [
                ...prev.slice(-49),
                { text, trans, id: msgId },
              ]);
            }
            setCaption("");
            setTransCaption("");
          } else {
            setCaption(text);
            if (trans) setTransCaption(trans);
          }
          return;
        }
        if (msg.type === "asr.translate") {
          const { id, trans } = msg;
          setHistory((prev) =>
            prev.map((item) => (item.id === id ? { ...item, trans } : item)),
          );
          return;
        }
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        setStatus("WebSocket 连接异常");
        reject(new Error("WebSocket 连接异常"));
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        if (running) {
          setStatus("连接已断开");
        }
      };
    });
  }, [startSendLoop, wsUrl, running]);

  // 窗口选择相关状态
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [desktopSources, setDesktopSources] = useState<
    {
      id: string;
      name: string;
      thumbnail: string;
      type?: "screen" | "window";
    }[]
  >([]);
  const [activeSourceTab, setActiveSourceTab] = useState<"screen" | "window">(
    "window",
  );

  // 启动主流程：连接 -> 采集音频 -> 处理重采样 -> 发送
  const start = useCallback(
    async (sourceId?: string) => {
      if (running) return;
      setRunning(true);
      setCaption("正在启动...");
      setTransCaption("");

      try {
        console.log("Starting: connecting to WS...");
        await connectWs();
        console.log("Starting: WS connected");

        setStatus("采集系统音频...");
        console.log("Starting: requesting display media...");

        let stream: MediaStream;
        if (sourceId) {
          // Electron 环境：使用 getUserMedia + chromeMediaSourceId
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              // @ts-ignore - Electron 特定约束
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            },
            video: {
              // @ts-ignore
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            },
          });
        } else {
          // 浏览器环境或 fallback
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        }

        console.log("Starting: media stream obtained");
        streamRef.current = stream;
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks || audioTracks.length === 0) {
          console.error("Starting: no audio tracks found");
          stop();
          setStatus("未发现音频轨道（请勾选共享标签页音频）");
          return;
        }

        console.log("Starting: initializing AudioContext...");
        // 初始化音频上下文，设置采样率为 48kHz
        const audioCtx = new AudioContext({
          sampleRate: 48000,
          latencyHint: "interactive",
        });
        audioCtxRef.current = audioCtx;

        // 防止最小化时音频上下文被挂起
        audioCtx.onstatechange = () => {
          if (audioCtx.state === "suspended") {
            console.log("AudioContext suspended, resuming...");
            audioCtx.resume();
          }
        };
        const source = audioCtx.createMediaStreamSource(stream);

        // 使用 AudioWorklet 替换 ScriptProcessor
        const workletCode = `
        class RecorderProcessor extends AudioWorkletProcessor {
          constructor() {
            super()
            this.resampleTail = new Float32Array(0)
            this.resamplePos = 0
            this.outRate = 16000
          }

          process(inputs, outputs, parameters) {
            const input = inputs[0]
            if (!input || !input.length) return true
            
            const inputChannel = input[0]
            if (!inputChannel) return true

            const inRate = sampleRate
            const ratio = inRate / this.outRate

            const data = new Float32Array(this.resampleTail.length + inputChannel.length)
            data.set(this.resampleTail, 0)
            data.set(inputChannel, this.resampleTail.length)

            const resampled = []
            while (this.resamplePos < data.length - 1) {
              const left = Math.floor(this.resamplePos)
              const right = left + 1
              const alpha = this.resamplePos - left
              
              const val = data[left] * (1 - alpha) + data[right] * alpha
              resampled.push(val)
              
              this.resamplePos += ratio
            }

            this.resampleTail = data.subarray(Math.max(0, Math.floor(this.resamplePos)))
            this.resamplePos = this.resamplePos - Math.floor(this.resamplePos)

            if (resampled.length > 0) {
               const pcm = new Int16Array(resampled.length)
               for (let i = 0; i < resampled.length; i++) {
                 const s = Math.max(-1, Math.min(1, resampled[i]))
                 const v = s < 0 ? s * 0x8000 : s * 0x7fff
                 pcm[i] = v
               }
               this.port.postMessage(pcm.buffer, [pcm.buffer])
            }

            return true
          }
        }
        registerProcessor('recorder-processor', RecorderProcessor)
      `;

        const blob = new Blob([workletCode], {
          type: "application/javascript",
        });
        const workletUrl = URL.createObjectURL(blob);

        try {
          await audioCtx.audioWorklet.addModule(workletUrl);
          const workletNode = new AudioWorkletNode(
            audioCtx,
            "recorder-processor",
          );

          workletNode.port.onmessage = (e) => {
            const ws = socketRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) return;

            const pcm = new Uint8Array(e.data);
            const merged = new Uint8Array(
              byteBufRef.current.length + pcm.length,
            );
            merged.set(byteBufRef.current, 0);
            merged.set(pcm, byteBufRef.current.length);
            byteBufRef.current = merged;

            while (byteBufRef.current.length >= FRAME_BYTES) {
              pushPcmBytes(byteBufRef.current.subarray(0, FRAME_BYTES));
              byteBufRef.current = byteBufRef.current.subarray(FRAME_BYTES);
            }
          };

          source.connect(workletNode);
          workletNode.connect(audioCtx.destination);

          // 保存引用以便清理
          spRef.current = workletNode as any;
        } catch (err) {
          console.error("AudioWorklet setup failed:", err);
          throw err;
        } finally {
          URL.revokeObjectURL(workletUrl);
        }

        setStatus("已连接");
        console.log("Starting: all setup complete");

        audioTracks[0].addEventListener("ended", () => {
          console.log("Starting: audio track ended");
          stop();
        });
      } catch (e: any) {
        console.error("Starting: error occurred", e);
        const errorMsg = e?.message || String(e);
        setStatus(`错误: ${errorMsg}`);
        if (
          errorMsg.includes("User cancelled") ||
          errorMsg.includes("Permission denied")
        ) {
          setRunning(false);
        } else {
          stop();
        }
      }
    },
    [connectWs, running, stop, pushPcmBytes, shiftPcmBytes],
  );

  const loadSourcesAndShow = useCallback(async () => {
    console.log("loadSourcesAndShow called");
    const rtcaptions = (window as any).rtcaptions;

    if (rtcaptions?.getDesktopSources) {
      try {
        console.log("Fetching desktop sources...");
        const sources = await rtcaptions.getDesktopSources();
        console.log("Sources fetched:", sources.length);
        setDesktopSources(sources);
        setShowSourceSelector(true);
      } catch (e) {
        console.error("Failed to get sources:", e);
        setStatus("获取窗口列表失败");
      }
    } else {
      console.warn(
        "rtcaptions.getDesktopSources not available, falling back to default start",
      );
      start();
    }
  }, [start]);

  const toggleFloat = useCallback(() => {
    setShowFloatingWindow((prev) => !prev);
  }, []);

  // 自动滚动到历史记录底部
  const historyEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history]);

  // 独立窗口下的专用渲染组件
  if (isFloatMode) {
    document.body.style.backgroundColor = "transparent";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";

    const data = floatData || {
      caption: "",
      transCaption: "",
      history: [],
      settings: {
        fontSize: 24,
        fontColor: "#FFFFFF",
        bgColor: "#000000",
        bgOpacity: 0.6,
        maxLines: 2,
        positionMode: "bottom",
      },
    };

    const { settings } = data;
    const hexToRgb = (hex: string) => {
      if (!hex) return { r: 0, g: 0, b: 0 };
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
    };
    const rgb = hexToRgb(settings.bgColor);
    const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${settings.bgOpacity})`;

    const linesToShow = (() => {
      const lines: { text: string; trans?: string; isPartial?: boolean }[] = [];
      if (data.caption) {
        lines.push({
          text: data.caption,
          trans: data.transCaption,
          isPartial: true,
        });
      }
      const historyNeeded = settings.maxLines - lines.length;
      if (historyNeeded > 0 && data.history) {
        const recentHistory = data.history.slice(-historyNeeded).reverse();
        recentHistory.forEach((h) => {
          lines.push({ text: h.text, trans: h.trans, isPartial: false });
        });
      }
      return lines.slice(0, settings.maxLines).reverse();
    })();

    return (
      <div
        className="float-container"
        style={
          {
            height: "100vh",
            width: "100vw",
            padding: "12px 20px",
            backgroundColor: bgColor,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            boxSizing: "border-box",
            WebkitAppRegion: "drag" as any,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(8px)",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            position: "relative",
          } as any
        }
      >
        <div
          onClick={() => (window as any).rtcaptions?.send("close-float")}
          style={{
            position: "absolute",
            top: 5,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            WebkitAppRegion: "no-drag" as any,
            backgroundColor: "rgba(0, 0, 0, 0.2)",
            color: "#FFF",
            fontSize: 14,
            zIndex: 1000,
            transition: "all 0.2s",
            backdropFilter: "blur(4px)",
          } as any}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 69, 58, 0.8)";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <CloseOutlined style={{ fontSize: 12 }} />
        </div>

        <div
          style={{
            position: "absolute",
            top: 5,
            left: 8,
            fontSize: 12,
            color: "#FFF",
            opacity: 0.3,
            pointerEvents: "none",
          }}
        >
          <DragOutlined />
        </div>

        {linesToShow.length === 0 && (
          <div
            style={{
              fontSize: settings.fontSize * 0.8,
              color: settings.fontColor,
              opacity: 0.5,
            }}
          >
            等待识别...
          </div>
        )}
        {linesToShow.map((line, idx) => (
          <div
            key={idx}
            style={{ marginBottom: idx === linesToShow.length - 1 ? 0 : 8 }}
          >
            <div
              style={{
                fontSize: line.isPartial
                  ? settings.fontSize
                  : settings.fontSize * 0.9,
                color: settings.fontColor,
                fontWeight: "bold",
                lineHeight: 1.4,
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                wordBreak: "break-word",
                opacity: line.isPartial ? 1 : 0.7,
              }}
            >
              {line.text}
            </div>
            {line.trans && (
              <div
                style={{
                  fontSize:
                    (line.isPartial
                      ? settings.fontSize
                      : settings.fontSize * 0.9) * 0.75,
                  color: settings.fontColor,
                  opacity: line.isPartial ? 0.8 : 0.5,
                  marginTop: 2,
                  textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  wordBreak: "break-word",
                }}
              >
                {line.trans}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Ant Design Theme Configuration
  const { defaultAlgorithm, darkAlgorithm } = antTheme;

  // New Render for Modern UI (based on TransFlow Pro design)
  if (!isFloatMode) {
    return (
      <ConfigProvider
        theme={{
          algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
          token: {
            colorPrimary: "#4f46e5", // Indigo 600
            borderRadius: 8,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          },
          components: {
            Select: {
              selectorBg: isDark ? "#1e293b" : "#f8fafc", // slate-800 : slate-50
              optionSelectedBg: isDark ? "#334155" : "#e0e7ff",
            },
            Switch: {
              colorPrimary: "#4f46e5",
            },
          },
        }}
      >
        <div
          className={`app-container ${isDark ? "dark" : ""}`}
          style={{ backgroundColor: isDark ? "#0f172a" : "#e2e8f0" }}
        >
          {/* Main Window Shell */}
          <div
            className="w-full h-full bg-slate-50 dark:bg-slate-800 flex flex-col overflow-hidden text-slate-700 dark:text-slate-200"
          >
            {/* Top Toolbar */}
            <header
              className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 shrink-0 z-10"
              style={{
                WebkitAppRegion: "drag",
              } as any}
            >
              <div
                className="flex items-center"
                style={{ gap: 24, WebkitAppRegion: "no-drag" } as any}
              >
                <div className="flex items-center" style={{ gap: 8 }}>
                  <TranslationOutlined
                    style={{ fontSize: 24, color: "#4f46e5" }}
                  />
                  <span
                    className="font-bold text-xl tracking-tight"
                    style={{ color: isDark ? "#f8fafc" : "#1e293b" }}
                  >
                    TransFlow <span className="text-indigo-600">Pro</span>
                  </span>
                </div>

                {translateEnabled && (
                  <>
                    <div
                      style={{
                        height: 16,
                        width: 1,
                        backgroundColor: isDark ? "#334155" : "#e2e8f0",
                      }}
                    ></div>

                    {/* Language Selector (Mock-up style) */}
                    <div className="flex items-center" style={{ gap: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 12px",
                          backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 8,
                          border: isDark
                            ? "1px solid #334155"
                            : "1px solid #e2e8f0",
                          cursor: "default",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>🇨🇳</span>
                        <span className="text-sm font-medium">中文 (简体)</span>
                      </div>
                      
                      <span className="text-slate-400">→</span>

                      <Select
                        value={translateTarget}
                        onChange={setTranslateTarget}
                        variant="borderless"
                        style={{
                          minWidth: 140,
                          backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 8,
                          border: isDark
                            ? "1px solid #334155"
                            : "1px solid #e2e8f0",
                        }}
                        options={[
                          { value: "中文 (简体)", label: "🇨🇳 中文 (简体)" },
                          { value: "English", label: "🇺🇸 English" },
                          { value: "日本語", label: "🇯🇵 日本語" },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>

              <div
                className="flex items-center"
                style={{ gap: 16, WebkitAppRegion: "no-drag" } as any}
              >
                <div className="text-xs text-slate-400 font-mono">
                  {new Date().toLocaleTimeString()}
                </div>
                <div className="flex items-center" style={{ gap: 4 }}>
                  <Tooltip title="设置">
                    <button
                      onClick={() => setShowSettings(true)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: isDark ? "#94a3b8" : "#64748b",
                      }}
                    >
                      <SettingOutlined style={{ fontSize: 18 }} />
                    </button>
                  </Tooltip>

                </div>
                {/* Theme Toggle (Hidden in main view to match design, or kept?) Design doesn't show it explicitly but good to have. I'll move it to Settings or keep it subtle. Let's keep it but make it smaller or part of the menu. Actually, let's keep it for functionality but maybe style it differently? User asked for Dropdown previously. I'll leave it but maybe move it before the time. */}
                <Select
                  value={themeMode}
                  onChange={setThemeMode}
                  variant="borderless"
                  style={{ width: 100 }}
                  options={[
                    {
                      value: "system",
                      label: (
                        <span>
                          <DesktopOutlined /> 系统
                        </span>
                      ),
                    },
                    {
                      value: "light",
                      label: (
                        <span>
                          <SunOutlined /> 亮色
                        </span>
                      ),
                    },
                    {
                      value: "dark",
                      label: (
                        <span>
                          <MoonOutlined /> 暗色
                        </span>
                      ),
                    },
                  ]}
                />

                <div
                  style={{
                    height: 16,
                    width: 1,
                    backgroundColor: isDark ? "#334155" : "#e2e8f0",
                    margin: "0 4px",
                  }}
                ></div>
                <Radio.Group
                  value={uiEdition}
                  onChange={(e) => setUiEdition(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="user">用户版</Radio.Button>
                  <Radio.Button value="geek">极客版</Radio.Button>
                </Radio.Group>

                {/* Window Controls */}
                <div
                  style={{
                    height: 16,
                    width: 1,
                    backgroundColor: isDark ? "#334155" : "#e2e8f0",
                    margin: "0 4px",
                  }}
                ></div>
                <div className="flex items-center" style={{ gap: 4 }}>
                  <button
                    onClick={() =>
                      (window as any).rtcaptions?.send("window-minimize")
                    }
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: isDark ? "#94a3b8" : "#64748b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MinusOutlined style={{ fontSize: 16 }} />
                  </button>
                  <button
                    onClick={() =>
                      (window as any).rtcaptions?.send("window-maximize")
                    }
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: isDark ? "#94a3b8" : "#64748b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BorderOutlined style={{ fontSize: 14 }} />
                  </button>
                  <button
                    onClick={() =>
                      (window as any).rtcaptions?.send("window-close")
                    }
                    className="p-2 hover:bg-red-500 hover:text-white rounded-lg text-slate-500 transition-colors"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: isDark ? "#94a3b8" : "#64748b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CloseOutlined style={{ fontSize: 16 }} />
                  </button>
                </div>
              </div>
            </header>

            {/* Main Content Area */}
            <main
              className="flex-1 flex overflow-hidden"
              style={{ minHeight: 0 }}
            >
              {/* Left Control Panel */}
              <aside
                className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shrink-0 overflow-y-auto hide-scrollbar"
              >
                {/* Main Actions (Big Button) */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col items-center">
                  <div
                    className="relative group"
                    style={{ position: "relative" }}
                  >
                    {running && (
                      <div className="absolute inset-0 bg-emerald-500/20 rounded-full scale-110 blur animate-pulse"></div>
                    )}
                    <button
                      onClick={running ? stop : loadSourcesAndShow}
                      className={`w-28 h-28 rounded-full flex flex-col items-center justify-center text-white shadow-xl border-none cursor-pointer transition-all duration-300 transform active:scale-95 ${running ? "bg-rose-500" : "bg-emerald-500"}`}
                    >
                      {running ? (
                        <StopOutlined
                          style={{ fontSize: 36, marginBottom: 4 }}
                        />
                      ) : (
                        <PlayCircleOutlined
                          style={{ fontSize: 36, marginBottom: 4 }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                        }}
                      >
                        {running ? "停止识别" : "开始识别"}
                      </span>
                    </button>
                  </div>
                  <p
                    style={{
                      marginTop: 16,
                      fontSize: 12,
                      fontWeight: 500,
                      color: running ? "#f43f5e" : "#64748b",
                    }}
                  >
                    {running
                      ? translateEnabled
                        ? "正在翻译中..."
                        : "正在识别中..."
                      : "就绪"}
                  </p>
                </div>

                {/* Settings Modules */}
                <div
                  style={{
                    flex: 1,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 32,
                  }}
                >
                  {/* Basic Settings */}
                  <section>
                    <h3
                      style={{
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 16,
                      }}
                    >
                      <SettingOutlined style={{ marginRight: 6 }} /> 基础设置
                    </h3>
                    <div className="flex flex-col space-y-1.5">
                      <label
                        className="text-xs font-medium text-slate-600"
                        style={{ marginBottom: 6 }}
                      >
                        识别引擎
                      </label>
                      <Select
                        value={asrMode}
                        onChange={setAsrMode}
                        style={{ width: "100%" }}
                      >
                        <Select.OptGroup label="离线模型 (推荐)">
                          <Select.Option value="local">本地模型 (Local)</Select.Option>
                        </Select.OptGroup>
                        <Select.OptGroup label="在线云端模型">
                          <Select.Option value="xfyun">讯飞云 (Xfyun)</Select.Option>
                          <Select.Option value="azure">Azure Speech</Select.Option>
                          <Select.Option value="tencent">腾讯云 (Tencent)</Select.Option>
                          <Select.Option value="gpt">OpenAI Whisper</Select.Option>
                        </Select.OptGroup>
                      </Select>
                    </div>
                  </section>

                  {/* Subtitle & Translation */}
                  <section>
                    <h3
                      style={{
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 16,
                      }}
                    >
                      <TranslationOutlined style={{ marginRight: 6 }} /> 翻译
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">启用翻译</span>
                        <Switch
                          size="small"
                          checked={translateEnabled}
                          onChange={setTranslateEnabled}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Float Window Settings (Removed from sidebar, now in settings modal) */}
                </div>

                <div
                  style={{
                    padding: 24,
                    borderTop: isDark
                      ? "1px solid #334155"
                      : "1px solid #f1f5f9",
                  }}
                >
                  <button
                    onClick={() => {
                      setHistory([]);
                      setCaption("");
                      setTransCaption("");
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: isDark
                        ? "1px solid #334155"
                        : "1px solid #e2e8f0",
                      backgroundColor: "transparent",
                      color: "#64748b",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "all 0.2s",
                    }}
                    className="hover:bg-slate-50"
                  >
                    <span className="iconify" data-icon="tabler:eraser"></span>
                    <span>清空当前会话</span>
                  </button>
                </div>
              </aside>

              {/* Subtitle Display Area */}
              <section
                style={{
                  flex: 1,
                  backgroundColor: isDark ? "#0f172a" : "#f8fafc", // slate-50/50 equivalent
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Visualizer Overlay */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    gap: 2,
                    opacity: 0.2,
                  }}
                >
                  {running && (
                    <>
                      <div className="w-1 bg-indigo-400 h-1 animate-pulse"></div>
                      <div
                        className="w-1 bg-indigo-400 h-2 animate-pulse"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-1 bg-indigo-400 h-3 animate-pulse"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className="w-1 bg-indigo-400 h-1 animate-pulse"
                        style={{ animationDelay: "0.3s" }}
                      ></div>
                    </>
                  )}
                </div>

                <div
                  id="scrollContainer"
                  className="hide-scrollbar"
                  onScroll={handleScroll}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "40px 48px 120px 48px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 20,
                  }}
                >
                  {history.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="group flex flex-col space-y-3"
                      style={{ opacity: 0.8 }}
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: isDark ? "#334155" : "#e2e8f0",
                            color: "#64748b",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {new Date().toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p
                          style={{
                            color: "#94a3b8",
                            fontSize: 18,
                            lineHeight: 1.6,
                            margin: 0,
                          }}
                        >
                          {item.text}
                        </p>
                        {item.trans && (
                          <p
                            style={{
                              color: isDark ? "#e2e8f0" : "#1e293b",
                              fontSize: 30,
                              fontWeight: 700,
                              lineHeight: 1.2,
                              margin: 0,
                            }}
                          >
                            {item.trans}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Live Caption Item */}
                  {(caption || transCaption) && (
                    <div className="group flex flex-col" style={{ gap: 8 }}>
                      <div className="flex items-center space-x-2">
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: "#4f46e5",
                            color: "white",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          LIVE
                        </span>
                        <span className="flex space-x-0.5" style={{ gap: 2 }}>
                          <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"></span>
                          <span
                            className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></span>
                          <span
                            className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.4s" }}
                          ></span>
                        </span>
                      </div>
                      <div className="space-y-4">
                        {caption && (
                          <p
                            style={{
                              color: "#94a3b8",
                              fontSize: 18,
                              lineHeight: 1.6,
                              borderLeft: "2px solid #e0e7ff",
                              paddingLeft: 8,
                              fontStyle: "italic",
                              margin: 0,
                            }}
                          >
                            {caption}
                          </p>
                        )}
                        {transCaption && (
                          <p
                            style={{
                              color: "#4f46e5",
                              fontSize: 36,
                              fontWeight: 900,
                              lineHeight: 1.2,
                              margin: 0,
                              paddingLeft: 8,
                            }}
                          >
                            {transCaption}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={historyEndRef} style={{ height: 1 }}></div>
                </div>

                {/* Float Control Overlay (Scroll Controls) */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 32,
                    right: 32,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {showScrollTop && (
                    <Tooltip title="回到顶部" placement="left">
                      <button
                        onClick={() => {
                          const container =
                            document.getElementById("scrollContainer");
                          if (container) {
                            container.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          backgroundColor: isDark ? "#1e293b" : "white",
                          border: isDark
                            ? "1px solid #334155"
                            : "1px solid #f1f5f9",
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#64748b",
                        }}
                      >
                        <VerticalAlignTopOutlined />
                      </button>
                    </Tooltip>
                  )}
                  {showScrollBottom && (
                    <Tooltip title="回到当前" placement="left">
                      <button
                        onClick={() => {
                          if (historyEndRef.current) {
                            (historyEndRef.current as any).scrollIntoView({
                              behavior: "smooth",
                            });
                          }
                        }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          backgroundColor: isDark ? "#1e293b" : "white",
                          border: isDark
                            ? "1px solid #334155"
                            : "1px solid #f1f5f9",
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#64748b",
                        }}
                      >
                        <VerticalAlignBottomOutlined />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </section>
            </main>

            {/* Bottom Status Bar */}
            <footer
              style={{
                height: 32,
                backgroundColor: isDark ? "#0f172a" : "#fff",
                borderTop: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 11,
                color: "#64748b",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              <div className="flex items-center space-x-6" style={{ gap: 24 }}>
                <div
                  className="flex items-center space-x-1.5"
                  style={{ gap: 6 }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: running ? "#10b981" : "#cbd5e1",
                    }}
                  ></span>
                  <span>{running ? "录音中: System Audio" : "未在录音"}</span>
                </div>
                <div
                  className="flex items-center space-x-1.5"
                  style={{ gap: 6 }}
                >
                  <span
                    style={{
                      color: status === "已连接" ? "#10b981" : "#94a3b8",
                    }}
                  >
                    ●
                  </span>
                  <span>服务器: {status}</span>
                </div>
              </div>
              <div className="flex items-center space-x-6" style={{ gap: 24 }}>
                <div
                  className="flex items-center space-x-1.5"
                  style={{ gap: 6 }}
                >
                  <span style={{ color: "#94a3b8" }}>🔒</span>
                  <span>端到端加密已开启</span>
                </div>
              </div>
            </footer>

            {/* Modal: Source Selection */}
            <Modal
              title={<span style={{ fontWeight: "bold" }}>选择捕获源</span>}
              open={showSourceSelector}
              onCancel={() => setShowSourceSelector(false)}
              footer={null}
              width={800}
              styles={{
                body: {
                  padding: 0,
                  height: "60vh",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                },
              }}
              centered
            >
              <div
                style={{ padding: "0 24px", borderBottom: "1px solid #f1f5f9" }}
              >
                <Tabs
                  activeKey={activeSourceTab}
                  onChange={(key) => setActiveSourceTab(key as any)}
                  items={[
                    {
                      key: "window",
                      label: (
                        <span>
                          <AppstoreOutlined /> 应用窗口
                        </span>
                      ),
                    },
                    {
                      key: "screen",
                      label: (
                        <span>
                          <DesktopOutlined /> 显示器
                        </span>
                      ),
                    },
                  ]}
                  tabBarStyle={{ marginBottom: 0 }}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 24,
                  backgroundColor: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 24,
                  }}
                >
                  {desktopSources
                    .filter((source) => {
                      const type =
                        source.type ||
                        (source.id.startsWith("screen") ? "screen" : "window");
                      return type === activeSourceTab;
                    })
                    .map((source) => (
                      <div
                        key={source.id}
                        className="source-card group"
                        onClick={() => {
                          setShowSourceSelector(false);
                          start(source.id);
                        }}
                      >
                        <div
                          style={{
                            aspectRatio: "16/9",
                            backgroundColor: "black",
                            borderRadius: 4,
                            border: "1px solid #1e293b",
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          <img
                            alt={source.name}
                            src={source.thumbnail}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                            }}
                          />
                        </div>
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            textAlign: "center",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            margin: 0,
                            padding: "0 4px",
                          }}
                          title={source.name}
                        >
                          {source.name}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </Modal>

            {/* Modal: Settings */}
            <Modal
              title={<span style={{ fontWeight: "bold" }}>系统设置</span>}
              open={showSettings}
              onCancel={() => setShowSettings(false)}
              onOk={() => {
                const form = (window as any).settingsForm;
                if (form) form.submit();
              }}
              okText="应用更改"
              cancelText="取消"
              width={800}
              styles={{
                body: {
                  padding: 0,
                  height: 520,
                  overflow: "hidden",
                },
              }}
              centered
            >
              <Form
                layout="vertical"
                initialValues={settings}
                onFinish={handleSettingsSave}
                ref={(inst) => {
                  (window as any).settingsForm = inst;
                }}
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                <Tabs
                  defaultActiveKey="asr"
                  tabBarGutter={20}
                  tabBarStyle={{ paddingLeft: 0, marginBottom: 0 }}
                  style={{ flex: 1, display: "flex", flexDirection: "column" }}
                  items={[
                    {
                      key: "asr",
                      label: "语音识别 (ASR)",
                      children: (
                        <div style={{ display: "flex", height: 450 }}>
                          <div
                            style={{
                              width: 180,
                              borderRight: isDark ? "1px solid #334155" : "1px solid #f1f5f9",
                              backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                              paddingTop: 8,
                            }}
                          >
                            <Menu
                              mode="inline"
                              selectedKeys={[activeSettingsMenu]}
                              onClick={(e) => setActiveSettingsMenu(e.key)}
                              style={{ backgroundColor: "transparent", borderRight: "none" }}
                              items={
                                uiEdition === "geek"
                                  ? [
                                      {
                                        key: "grp_offline",
                                        label: "离线识别",
                                        type: "group",
                                        children: [
                                          { key: "asr_local", icon: <AudioOutlined />, label: "本地接口" },
                                        ],
                                      },
                                      {
                                        key: "grp_online",
                                        label: "在线云端",
                                        type: "group",
                                        children: [
                                          { key: "asr_xfyun", icon: <AppstoreOutlined />, label: "讯飞云" },
                                          { key: "asr_azure", icon: <AppstoreOutlined />, label: "Azure Speech" },
                                          { key: "asr_tencent", icon: <AppstoreOutlined />, label: "腾讯云" },
                                        ],
                                      },
                                    ]
                                  : [
                                      {
                                        key: "grp_offline",
                                        label: "离线识别",
                                        type: "group",
                                        children: [
                                          { key: "asr_local", icon: <AudioOutlined />, label: "本地接口" },
                                        ],
                                      },
                                    ]
                              }
                            />
                          </div>

                          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
                            {activeSettingsMenu === "asr_local" && (
                              <div className="animate-in fade-in duration-300">
                                <Typography.Title level={5} style={{ marginBottom: 16 }}>
                                  本地接口配置
                                </Typography.Title>
                                <Card size="small" style={{ borderStyle: "dashed" }}>
                                  <Form.Item
                                    label="接口地址"
                                    name="whisperBaseUrl"
                                    extra="用于 OpenAI Whisper 或兼容接口的本地地址"
                                    style={{ marginBottom: 0 }}
                                  >
                                    <Input placeholder="http://127.0.0.1:2022/v1" />
                                  </Form.Item>
                                </Card>
                              </div>
                            )}

                            {uiEdition === "geek" && activeSettingsMenu === "asr_xfyun" && (
                              <div className="animate-in fade-in duration-300">
                                <Typography.Title level={5} style={{ marginBottom: 16 }}>
                                  讯飞云 (Xfyun) 配置
                                </Typography.Title>
                                <Card size="small">
                                  <Form.Item label="AppID" name="xfAppId">
                                    <Input placeholder="AppID" />
                                  </Form.Item>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <Form.Item label="API Key" name="xfApiKey">
                                      <Input.Password placeholder="API Key" />
                                    </Form.Item>
                                    <Form.Item label="API Secret" name="xfApiSecret">
                                      <Input.Password placeholder="API Secret" />
                                    </Form.Item>
                                  </div>
                                </Card>
                              </div>
                            )}

                            {uiEdition === "geek" && activeSettingsMenu === "asr_azure" && (
                              <div className="animate-in fade-in duration-300">
                                <Typography.Title level={5} style={{ marginBottom: 16 }}>
                                  Azure Speech 配置
                                </Typography.Title>
                                <Card size="small">
                                  <Form.Item label="订阅密钥 (Key)" name="azureKey">
                                    <Input.Password placeholder="Azure Key" />
                                  </Form.Item>
                                  <Form.Item label="服务区域 (Region)" name="azureRegion">
                                    <Input placeholder="eastasia" />
                                  </Form.Item>
                                </Card>
                              </div>
                            )}

                            {uiEdition === "geek" && activeSettingsMenu === "asr_tencent" && (
                              <div className="animate-in fade-in duration-300">
                                <Typography.Title level={5} style={{ marginBottom: 16 }}>
                                  腾讯云 (Tencent) 配置
                                </Typography.Title>
                                <Card size="small">
                                  <Form.Item label="SecretId" name="tencentSecretId">
                                    <Input placeholder="SecretId" />
                                  </Form.Item>
                                  <Form.Item label="SecretKey" name="tencentSecretKey">
                                    <Input.Password placeholder="SecretKey" />
                                  </Form.Item>
                                </Card>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    },
                    ...(uiEdition === "geek"
                      ? [
                          {
                            key: "translation",
                            label: "翻译设置",
                            children: (
                              <div style={{ padding: "32px", height: 450, overflowY: "auto" }}>
                                <Typography.Title level={5} style={{ marginBottom: 20 }}>
                                  文本翻译模型配置
                                </Typography.Title>
                                <Form.Item label="LLM 接口地址" name="llmBaseUrl">
                                  <Input placeholder="https://api.openai.com/v1" />
                                </Form.Item>
                                <Form.Item label="API Key" name="llmApiKey">
                                  <Input.Password placeholder="sk-..." />
                                </Form.Item>
                                <Form.Item label="翻译模型名称" name="llmModel">
                                  <Input placeholder="gpt-3.5-turbo" />
                                </Form.Item>
                              </div>
                            ),
                          },
                        ]
                      : []),
                    {
                      key: "floating",
                      label: "悬浮窗",
                      children: (
                        <div style={{ padding: "32px", overflowY: "auto", height: 450 }}>
                          <Typography.Title level={5} style={{ marginBottom: 24 }}>
                            悬浮窗显示设置
                          </Typography.Title>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                            <Card size="small" title="基础状态">
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span>启用悬浮窗</span>
                                <Switch checked={showFloatingWindow} onChange={setShowFloatingWindow} />
                              </div>
                            </Card>

                            <Card size="small" title="显示布局">
                              <Form.Item label="字幕位置" style={{ marginBottom: 16 }}>
                                <Select
                                  value={floatPositionMode}
                                  onChange={setFloatPositionMode}
                                  options={[
                                    { value: "bottom", label: "底部居中" },
                                    { value: "top", label: "顶部居中" }
                                  ]}
                                />
                              </Form.Item>
                              <Form.Item label="最大显示行数" style={{ marginBottom: 0 }}>
                                <Slider min={1} max={5} value={floatMaxLines} onChange={setFloatMaxLines} />
                              </Form.Item>
                            </Card>

                            <Card size="small" title="外观样式">
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>字体大小 ({floatFontSize}px)</div>
                                <Slider min={12} max={72} value={floatFontSize} onChange={setFloatFontSize} />
                              </div>
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>背景透明度 ({Math.round(floatBgOpacity * 100)}%)</div>
                                <Slider min={0} max={1} step={0.01} value={floatBgOpacity} onChange={setFloatBgOpacity} />
                              </div>
                              <div style={{ display: "flex", gap: 24 }}>
                                <div>
                                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>字体颜色</div>
                                  <ColorPicker value={floatFontColor} onChange={(color) => setFloatFontColor(color.toHexString())} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>背景颜色</div>
                                  <ColorPicker value={floatBgColor} onChange={(color) => setFloatBgColor(color.toHexString())} />
                                </div>
                              </div>
                            </Card>
                          </div>
                        </div>
                      )
                    }
                  ]}
                />
              </Form>
            </Modal>
          </div>
        </div>
      </ConfigProvider>
    );
  }
}
