"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Theme = "calm" | "modern" | "friendly";
type Mode = "general" | "english";
type Message = { id: string; role: "user" | "assistant"; text: string; file?: string };
type User = { id: string; email: string; name: string; avatarUrl: string | null };
type Conversation = { id: string; title: string; mode: Mode; createdAt: number; updatedAt: number; deletedAt?: number | null };
type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type Recognition = {
  lang: string;
  start: () => void;
  onresult: (event: SpeechResultEvent) => void;
  onend: () => void;
  onerror: () => void;
};
type RecognitionConstructor = new () => Recognition;

const histories = [
  ["◌", "Luyện nói tiếng Anh chủ đề du lịch"],
  ["▥", "Giải thích khái niệm lãi suất kép"],
  ["⌁", "Gợi ý thực đơn tuần này"],
  ["◫", "Tóm tắt tài liệu PDF"],
  ["✦", "Ý tưởng bài viết blog"],
  ["⌂", "Kế hoạch tập luyện tại nhà"],
];

const themes: Record<Theme, { name: string; note: string }> = {
  calm: { name: "Calm", note: "Nền kem & xanh lá · nhẹ mắt, cân bằng" },
  modern: { name: "Modern", note: "Nền tối & tím · công nghệ, tập trung" },
  friendly: { name: "Friendly", note: "Trắng xanh & cam · vui vẻ, gần gũi" },
};

const suggestions = {
  general: [
    ["◌", "Giải đáp mọi thắc mắc", "Kiến thức, công việc và cuộc sống hằng ngày"],
    ["▤", "Phân tích tài liệu", "Tóm tắt, trích xuất và giải thích nhanh"],
    ["✦", "Gợi ý và lên kế hoạch", "Ý tưởng sáng tạo và tổ chức hiệu quả"],
  ],
  english: [
    ["Aa", "Luyện nói cùng Mandy", "Hội thoại tự nhiên và sửa lỗi theo trình độ"],
    ["✓", "Kiểm tra bài viết", "Ngữ pháp, từ vựng và cách diễn đạt"],
    ["▦", "Tạo bài học", "Bài tập, từ vựng và hoạt động cho lớp học"],
  ],
};

export default function Home() {
  const [theme, setTheme] = useState<Theme>("calm");
  const [mode, setMode] = useState<Mode>("general");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [fileName, setFileName] = useState("");
  const [model, setModel] = useState("Mandy AI");
  const [modelOpen, setModelOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [trashedConversations, setTrashedConversations] = useState<Conversation[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    // Remove any legacy PWA worker/cache that may still submit the old form bundle.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
    }
    if ("caches" in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    }

    const savedTheme = window.localStorage.getItem("mandy-theme");
    const savedAutoSpeak = window.localStorage.getItem("mandy-auto-speak");
    if (savedTheme === "calm" || savedTheme === "modern" || savedTheme === "friendly") {
      window.setTimeout(() => setTheme(savedTheme), 0);
    }
    if (savedAutoSpeak === "true") window.setTimeout(() => setAutoSpeak(true), 0);
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then(async (data: { user: User | null }) => {
        setUser(data.user);
        if (!data.user) {
          window.location.replace("/login");
          return;
        }
        const response = await fetch("/api/conversations");
        if (response.ok) {
          const payload = (await response.json()) as { conversations: Conversation[] };
          setConversations(payload.conversations);
        }
      })
      .catch(() => window.location.replace("/login"))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => window.localStorage.setItem("mandy-theme", theme), [theme]);
  useEffect(() => window.localStorage.setItem("mandy-auto-speak", String(autoSpeak)), [autoSpeak]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, typing]);

  const filtered = useMemo(
    () => histories.filter((item) => item[1].toLowerCase().includes(search.toLowerCase())),
    [search],
  );
  const filteredConversations = useMemo(
    () => conversations.filter((item) => item.title.toLowerCase().includes(search.toLowerCase())),
    [conversations, search],
  );

  const newChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setDraft("");
    setFileName("");
    setMode("general");
    setSidebarOpen(false);
  };

  const saveMessage = async (conversationId: string, message: Message) => {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("Không thể lưu tin nhắn.");
  };

  const send = async () => {
    const text = draft.trim() || (fileName ? `Phân tích tệp ${fileName}` : "");
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    const id = crypto.randomUUID();
    let conversationId = currentConversationId;
    if (!conversationId && user) {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 70), mode }),
      });
      if (response.ok) {
        const data = (await response.json()) as { conversation: Conversation };
        conversationId = data.conversation.id;
        setCurrentConversationId(conversationId);
        setConversations((items) => [data.conversation, ...items]);
      }
    }
    const userMessage: Message = { id, role: "user", text, file: fileName || undefined };
    setMessages((items) => [...items, userMessage]);
    if (conversationId) void saveMessage(conversationId, userMessage).catch(() => undefined);
    setDraft("");
    setFileName("");
    setTyping(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          mode,
          style: model,
          webSearch,
        }),
      });
      const payload = (await response.json().catch(() => ({
        error: "Máy chủ trả về phản hồi không hợp lệ.",
      }))) as { text?: string; error?: string };
      const reply = response.ok && payload.text
        ? payload.text
        : `Mandy AI gặp lỗi: ${payload.error ?? "Không thể tạo câu trả lời."}`;
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", text: reply };
      setMessages((items) => [...items, assistantMessage]);
      if (conversationId) void saveMessage(conversationId, assistantMessage).catch(() => undefined);
      if (autoSpeak) speak(reply);
    } catch {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Mandy AI chưa thể kết nối. Bạn hãy thử lại sau một lát.",
      };
      setMessages((items) => [...items, assistantMessage]);
      if (conversationId) void saveMessage(conversationId, assistantMessage).catch(() => undefined);
    } finally {
      sendingRef.current = false;
      setTyping(false);
    }
  };

  const openConversation = async (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
    setMode(conversation.mode);
    setSidebarOpen(false);
    const response = await fetch(`/api/conversations/${conversation.id}/messages`);
    if (!response.ok) return;
    const data = (await response.json()) as { messages: Message[] };
    setMessages(data.messages);
  };

  const openTrash = async () => {
    const nextOpen = !trashOpen;
    setTrashOpen(nextOpen);
    if (!nextOpen) return;
    const response = await fetch("/api/conversations?trash=1");
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: Conversation[] };
    setTrashedConversations(data.conversations);
  };

  const deleteConversation = async (conversation: Conversation) => {
    const response = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    if (!response.ok) return;
    setConversations((items) => items.filter((item) => item.id !== conversation.id));
    setTrashedConversations((items) => [{ ...conversation, deletedAt: Date.now() }, ...items]);
    if (currentConversationId === conversation.id) newChat();
  };

  const restoreConversation = async (conversation: Conversation) => {
    const response = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (!response.ok) return;
    setTrashedConversations((items) => items.filter((item) => item.id !== conversation.id));
    setConversations((items) => [{ ...conversation, deletedAt: null, updatedAt: Date.now() }, ...items]);
  };

  const permanentlyDeleteConversation = async (conversation: Conversation) => {
    if (!window.confirm(`Xóa vĩnh viễn “${conversation.title}”? Hành động này không thể hoàn tác.`)) return;
    const response = await fetch(`/api/conversations/${conversation.id}?permanent=1`, { method: "DELETE" });
    if (response.ok) setTrashedConversations((items) => items.filter((item) => item.id !== conversation.id));
  };

  const logout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.assign("/login");
  };

  const attach = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const listen = () => {
    const w = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) {
      setDraft("Trình duyệt này chưa hỗ trợ nhập bằng giọng nói.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = mode === "english" ? "en-US" : "vi-VN";
    setListening(true);
    recognition.onresult = (event) => setDraft(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  if (!authChecked || !user) {
    return (
      <main className="login-screen">
        <div className="login-loader"><span /><span /><span /></div>
      </main>
    );
  }

  return (
    <main className={`app theme-${theme}`}>
      <button className="mobile-menu" aria-label="Mở menu" onClick={() => setSidebarOpen(true)}>☰</button>
      {sidebarOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark" />
          <div><strong>Mandy AI</strong><small>Personal AI Chat</small></div>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)}>×</button>
        </div>

        <button className="new-chat" onClick={newChat}><b>＋</b> Cuộc trò chuyện mới</button>
        <label className="search">
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm" />
          <kbd>⌘ K</kbd>
        </label>

        <div className="history">
          <p className="section-label">Hôm nay</p>
          <button className={`history-item english-entry ${mode === "english" ? "active" : ""}`} onClick={() => { setMode("english"); setSidebarOpen(false); }}>
            <span className="item-icon">Aa</span><b>Mandy English</b><i>›</i>
          </button>
          {!trashOpen && (filteredConversations.length > 0
            ? filteredConversations.map((conversation) => (
                <div className="history-row" key={conversation.id}>
                  <button className="history-item" onClick={() => void openConversation(conversation)}>
                    <span className="item-icon">◌</span><span>{conversation.title}</span>
                  </button>
                  <button className="history-action" title="Chuyển vào Thùng rác" onClick={() => void deleteConversation(conversation)}>⌫</button>
                </div>
              ))
            : filtered.map(([icon, title]) => (
                <button className="history-item" key={title} onClick={() => { setDraft(title); setSidebarOpen(false); }}>
                  <span className="item-icon">{icon}</span><span>{title}</span><i>›</i>
                </button>
              )))}
          {trashOpen && (
            <div className="trash-list">
              <p className="section-label">Đã xóa gần đây</p>
              {trashedConversations.length ? trashedConversations.map((conversation) => (
                <div className="trash-item" key={conversation.id}>
                  <span><b>{conversation.title}</b><small>Có thể khôi phục</small></span>
                  <button title="Khôi phục" onClick={() => void restoreConversation(conversation)}>↶</button>
                  <button title="Xóa vĩnh viễn" onClick={() => void permanentlyDeleteConversation(conversation)}>×</button>
                </div>
              )) : <p className="trash-empty">Thùng rác đang trống.</p>}
            </div>
          )}
        </div>

        <button className={`trash-toggle ${trashOpen ? "active" : ""}`} onClick={() => void openTrash()}>
          <span>♲</span><b>{trashOpen ? "Quay lại lịch sử" : "Thùng rác"}</b>
          {trashedConversations.length > 0 && <i>{trashedConversations.length}</i>}
        </button>

        <div className="profile">
          <span className="avatar">M</span>
          <span><b>{user.name}</b><small>{user.email}</small></span>
          <button onClick={() => void logout()} title="Đăng xuất">↪</button>
        </div>
        <div className="sidebar-tools">
          <button onClick={() => setTheme(theme === "calm" ? "modern" : theme === "modern" ? "friendly" : "calm")}>◐ <span>Đổi giao diện</span></button>
          <button onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }}>⚙ <span>Cài đặt</span></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="dropdown-wrap">
            <button className="model-select" onClick={() => setModelOpen(!modelOpen)}>
              <span className="spark">✦</span><b>{model}</b><small>{mode === "english" ? "English Coach" : "Cân bằng"}</small><span>⌄</span>
            </button>
            {modelOpen && (
              <div className="dropdown model-menu">
                {["Mandy AI", "Mandy Fast", "Mandy Creative"].map((item) => (
                  <button key={item} onClick={() => { setModel(item); setModelOpen(false); }}>{item}<small>{item === model ? "✓" : ""}</small></button>
                ))}
              </div>
            )}
          </div>

          <div className="top-actions">
            <div className="sync"><span>●</span> Đã đồng bộ <i>▯</i><i>▰</i></div>
            <div className="dropdown-wrap">
              <button className="theme-button" onClick={() => setThemeOpen(!themeOpen)}>
                <span className={`theme-dot ${theme}`} />
                <span className="theme-current"><small>Giao diện</small><b>{themes[theme].name}</b></span>
                <span>⌄</span>
              </button>
              {themeOpen && (
                <div className="dropdown theme-menu">
                  {(Object.keys(themes) as Theme[]).map((item) => (
                    <button key={item} onClick={() => { setTheme(item); setThemeOpen(false); }}>
                      <span className={`theme-preview ${item}`} />
                      <span><b>{themes[item].name}</b><small>{themes[item].note}</small></span>
                      {theme === item && <i>✓</i>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={`content ${messages.length ? "chat-active" : ""}`}>
          {!messages.length ? (
            <section className="welcome">
              <div className="hero-orb"><span>{theme === "friendly" ? "☺" : "✦"}</span></div>
              <h1>Chào bạn, hôm nay<br className="calm-break" /> mình có thể giúp gì?</h1>
              <p>{mode === "english" ? "Học, luyện tập và sáng tạo bài giảng cùng Mandy English." : "Hỏi bất cứ điều gì, làm việc với tài liệu hoặc luyện tập tiếng Anh."}</p>

              <div className="suggestions">
                {suggestions[mode].map(([icon, title, detail]) => (
                  <button key={title} onClick={() => { setDraft(title); document.querySelector<HTMLTextAreaElement>(".message-input")?.focus(); }}>
                    <span className="suggestion-icon">{icon}</span>
                    <span><b>{title}</b><small>{detail}</small></span><i>→</i>
                  </button>
                ))}
              </div>
              <div className="device-note"><span>▱</span><i>···· ✓ ····</i><span>▯</span><small>Đồng bộ trên mọi thiết bị</small></div>
            </section>
          ) : (
            <section className="messages" aria-live="polite">
              <div className="chat-title"><span>{mode === "english" ? "Aa" : "✦"}</span><div><b>{mode === "english" ? "Mandy English" : "Mandy AI"}</b><small>{model}</small></div></div>
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <span className="message-avatar">{message.role === "user" ? "Bạn" : "M"}</span>
                  <div>{message.file && <small className="file-pill">▤ {message.file}</small>}<p>{message.text}</p></div>
                  {message.role === "assistant" && <button onClick={() => speak(message.text)}>◖))</button>}
                </article>
              ))}
              {typing && <div className="typing"><span /><span /><span /></div>}
              <div ref={endRef} />
            </section>
          )}

          <div className="composer" role="group" aria-label="Soạn tin nhắn">
            {fileName && <div className="attached-file"><span>▤ {fileName}</span><button type="button" onClick={() => setFileName("")}>×</button></div>}
            <button type="button" className={`web-search ${webSearch ? "active" : ""}`} onClick={() => setWebSearch(!webSearch)}>
              ◎ {webSearch ? "Đang tìm trên Web" : "Tìm trên Web"}
            </button>
            <textarea className="message-input" value={draft} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
              rows={1} placeholder={mode === "english" ? "Hỏi Mandy English..." : "Nhắn tin cho Mandy AI..."} />
            <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={attach} />
            <button type="button" className="attach" onClick={() => fileRef.current?.click()}>⌕</button>
            <button type="button" className={`voice ${listening ? "listening" : ""}`} onClick={listen}>♩</button>
            <button type="button" className="send" onClick={() => void send()}>➤</button>
          </div>
          <p className="composer-note">Hỗ trợ ảnh, PDF, Word và Excel · Dữ liệu được đồng bộ theo tài khoản</p>
        </div>
      </section>

      {settingsOpen && (
        <div className="settings-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header>
              <div>
                <span className="settings-eyebrow">Mandy AI</span>
                <h2 id="settings-title">Cài đặt</h2>
              </div>
              <button className="settings-close" aria-label="Đóng cài đặt" onClick={() => setSettingsOpen(false)}>×</button>
            </header>

            <div className="settings-group">
              <h3>Tài khoản</h3>
              <div className="settings-account">
                <span className="avatar">M</span>
                <span><b>{user.name}</b><small>{user.email}</small></span>
                <span className="connected-badge">● Đã kết nối</span>
              </div>
            </div>

            <div className="settings-group">
              <h3>Giao diện</h3>
              <div className="settings-themes">
                {(Object.keys(themes) as Theme[]).map((item) => (
                  <button className={theme === item ? "active" : ""} key={item} onClick={() => setTheme(item)}>
                    <span className={`settings-theme-card ${item}`} />
                    <span><b>{themes[item].name}</b><small>{themes[item].note.split("·")[0]}</small></span>
                    {theme === item && <i>✓</i>}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <h3>Trò chuyện</h3>
              <label className="settings-toggle">
                <span><b>Tự động đọc câu trả lời</b><small>Dùng giọng đọc của thiết bị</small></span>
                <input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} />
                <i />
              </label>
              <label className="settings-mode">
                <span><b>Chế độ mặc định</b><small>Chọn trợ lý khi mở cuộc trò chuyện mới</small></span>
                <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                  <option value="general">Mandy AI</option>
                  <option value="english">Mandy English</option>
                </select>
              </label>
            </div>

            <div className="settings-actions">
              <button onClick={() => { setSettingsOpen(false); void openTrash(); }}>♲ Mở thùng rác</button>
              <button className="logout-setting" onClick={() => void logout()}>Đăng xuất</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
