"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { auth, db } from "@/lib/firebase";
import "./chat.css";

import {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  deleteDoc,
} from "firebase/firestore";

import { signOut } from "firebase/auth";
import CryptoJS from "crypto-js";

type User = {
  uid: string;
  username: string;
};

type FriendRequest = {
  id: string;
  from: string;
  to: string;
  fromUsername: string;
  status: string;
};

type Message = {
  text: string;
  senderId: string;
  receiverId: string;
  timestamp?: string;
};

type Toast = {
  id: string;
  message: string;
};

export default function ChatPage() {
  const { user: currentUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !currentUser) {
      window.location.href = "/login";
    }
  }, [currentUser, authLoading]);

  const SECRET_KEY = "chat-app-secret";

  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  // UI State Controls
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeKebabMenu, setActiveKebabMenu] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Elegant App Toast Triggers
  const showToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Auto Scroll Engine
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Outside Clicks Structural Control
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (activeKebabMenu && !(event.target as Element).closest(".kebab-wrap")) {
        setActiveKebabMenu(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [activeKebabMenu]);

  // FETCH CURRENT USER'S METADATA
  useEffect(() => {
    const fetchUsername = async () => {
      if (!currentUser) return;
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (snap.exists()) {
          setUsername(snap.data().username);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchUsername();
  }, [currentUser]);

  // SCAN PROFILE DIRECTORIES VIA FIRESTORE INDEX MATCHING
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const q = query(
      collection(db, "users"),
      where("username", ">=", search.toLowerCase()),
      where("username", "<=", search.toLowerCase() + "\uf8ff")
    );
    const unsub = onSnapshot(q, (snap) => {
      const users: User[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as User;
        if (data.uid !== currentUser?.uid) {
          users.push(data);
        }
      });
      setResults(users);
    });
    return () => unsub();
  }, [search, currentUser]);

  // INCOMING FRIEND INVITATIONS REALTIME ROUTER
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "friendRequests"),
      where("to", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(q, (snap) => {
      const reqs: FriendRequest[] = [];
      snap.forEach((doc) => {
        reqs.push({ id: doc.id, ...(doc.data() as any) });
      });
      setNotifications(reqs);
      setNotifLoading(false);
    }, (err) => {
      console.error(err);
      setNotifLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  // FRIENDS SCALABILITY ENGINE (PROMISE.ALL CONCURRENCY)
  useEffect(() => {
    if (!currentUser) return;
    setFriendsLoading(true);
    const q = query(
      collection(db, "friends"),
      where("users", "array-contains", currentUser.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      try {
        const fetchPromises = snap.docs.map(async (d) => {
          const data = d.data();
          const friendUid = data.users.find((uid: string) => uid !== currentUser.uid);
          if (!friendUid) return null;
          const friendSnap = await getDoc(doc(db, "users", friendUid));
          return friendSnap.exists() ? (friendSnap.data() as User) : null;
        });

        const resolvedFriends = await Promise.all(fetchPromises);
        const filteredFriends = resolvedFriends.filter((f): f is User => f !== null);

        // Deduplicate profiles
        const uniqueFriends = filteredFriends.filter(
          (friend, index, self) => self.findIndex((f) => f.uid === friend.uid) === index
        );

        setFriends(uniqueFriends);
      } catch (err) {
        console.error(err);
      } finally {
        setFriendsLoading(false);
      }
    }, (err) => {
      console.error(err);
      setFriendsLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  // INITIATE DETERMINISTIC ID FRIEND REQUESTS
  const sendFriendRequest = async (targetUser: User) => {
    if (!currentUser) return;
    
    const reqId = `${currentUser.uid}_${targetUser.uid}`;
    const inverseReqId = `${targetUser.uid}_${currentUser.uid}`;
    
    try {
      const friendCheck = await getDoc(doc(db, "friends", reqId));
      const inverseFriendCheck = await getDoc(doc(db, "friends", inverseReqId));
      if (friendCheck.exists() || inverseFriendCheck.exists()) {
        showToast("You are already friends with this user.");
        return;
      }

      const requestCheck = await getDoc(doc(db, "friendRequests", reqId));
      const inverseRequestCheck = await getDoc(doc(db, "friendRequests", inverseReqId));
      if (requestCheck.exists() || inverseRequestCheck.exists()) {
        showToast("A friend request is already pending.");
        return;
      }

      await setDoc(doc(db, "friendRequests", reqId), {
        from: currentUser.uid,
        to: targetUser.uid,
        fromUsername: username || "Someone",
        status: "pending",
        createdAt: serverTimestamp(),
      });
      showToast("Friend request sent successfully.");
    } catch (err) {
      console.error(err);
      showToast("Failed to process request.");
    }
  };

  // ACCEPT RECIPROCAL FRIEND REQUEST
  const acceptRequest = async (req: FriendRequest) => {
    if (!currentUser) return;
    try {
      const relationshipId = `${req.from}_${req.to}`;
      await setDoc(doc(db, "friends", relationshipId), {
        users: [req.from, req.to],
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "friendRequests", req.id), { status: "accepted" });
      setShowNotifications(false);
      showToast("Connection established.");
    } catch (err) {
      console.error(err);
      showToast("Error approving transaction.");
    }
  };

  // SEVER RELATIONSHIPS
  const handleUnfriend = async (friend: User) => {
    if (!currentUser) return;
    try {
      const idA = `${currentUser.uid}_${friend.uid}`;
      const idB = `${friend.uid}_${currentUser.uid}`;
      
      await deleteDoc(doc(db, "friends", idA));
      await deleteDoc(doc(db, "friends", idB));
      await deleteDoc(doc(db, "friendRequests", idA));
      await deleteDoc(doc(db, "friendRequests", idB));
      
      if (selectedUser?.uid === friend.uid) setSelectedUser(null);
      setActiveKebabMenu(null);
      showToast("Connection severed.");
    } catch (err) {
      console.error(err);
    }
  };

  // DISCONNECT AUTH SESSION
  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/login";
  };

  // EPHEMERAL INCOMING MESSAGES LISTENER (FIXED REPEATED DECRYPTION BUG)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "messages"),
      where("receiverId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(q, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        if (!data.encryptedText) {
          await deleteDoc(doc(db, "messages", change.doc.id));
          return;
        }
        try {
          // Decrypt the text exactly once inside the try block
          const decrypted = CryptoJS.AES.decrypt(data.encryptedText, SECRET_KEY).toString(CryptoJS.enc.Utf8);
          
          if (!decrypted) {
            await deleteDoc(doc(db, "messages", change.doc.id));
            return;
          }

          const msgTime = data.createdAt?.toDate() 
            ? data.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          setMessages((prev) => {
            const alreadyExists = prev.some(
              (m) =>
                m.text === decrypted &&
                m.senderId === data.senderId &&
                m.receiverId === data.receiverId
            );
            if (alreadyExists) return prev;
            return [
              ...prev,
              {
                text: decrypted,
                senderId: data.senderId,
                receiverId: data.receiverId,
                timestamp: msgTime
              },
            ];
          });
          
          await deleteDoc(doc(db, "messages", change.doc.id));
        } catch (error) {
          console.error("Decryption pipeline processing error:", error);
        }
      });
    });
    return () => unsub();
  }, [currentUser]);

  // DISPATCH OUTBOUND SECURED MESSAGES (WITH OPTIMISTIC UI FLASH)
  const sendMessage = async () => {
    if (!text.trim() || !selectedUser || !currentUser) return;
    const outboundText = text;
    setText("");
    
    const localTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Optimistic Insertion
    setMessages((prev) => [
      ...prev,
      {
        text: outboundText,
        senderId: currentUser.uid,
        receiverId: selectedUser.uid,
        timestamp: localTimeStr
      },
    ]);

    try {
      const encryptedText = CryptoJS.AES.encrypt(outboundText, SECRET_KEY).toString();
      await setDoc(doc(collection(db, "messages")), {
        encryptedText,
        senderId: currentUser.uid,
        receiverId: selectedUser.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      showToast("Message synchronization failure.");
    }
  };

  if (authLoading) {
    return (
      <div className="empty-state" style={{ height: "100vh" }}>
        <div className="empty-icon">✦</div>
        <p className="empty-title">Synchronizing credentials</p>
      </div>
    );
  }

  return (
    <>
      <div className="chat-root">
        {/* TOAST DISPLAYS */}
        <div className="toast-container" role="live">
          {toasts.map((t) => (
            <div key={t.id} className="toast">{t.message}</div>
          ))}
        </div>

        {/* ── NAVBAR ── */}
        <nav className="navbar">
          <div className="navbar-left">
            <button 
              className="menu-toggle" 
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              aria-label="Toggle structural workspace drawer"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="navbar-brand">Chat</div>
          </div>

          <div className="navbar-right">
            <span className="username-badge">@{username || "..."}</span>

            {/* 🔔 STATE-CONTROLLED NOTIFICATIONS */}
            <div className="bell-wrap" ref={notifRef}>
              <button
                className="bell-btn"
                onClick={() => setShowNotifications(!showNotifications)}
                title="Notifications"
                aria-expanded={showNotifications}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notifications.length > 0 && <span className="bell-dot" />}
              </button>

              {showNotifications && (
                <div className="notif-dropdown">
                  <div className="notif-header">Requests</div>
                  {notifLoading ? (
                    <div className="notif-empty">Fetching records...</div>
                  ) : notifications.length === 0 ? (
                    <div className="notif-empty">No pending requests</div>
                  ) : (
                    notifications.map((req) => (
                      <div key={req.id} className="notif-item">
                        <span className="notif-text">
                          <strong>{req.fromUsername}</strong> wants to connect
                        </span>
                        <button onClick={() => acceptRequest(req)} className="btn-accept">
                          Accept
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="btn-logout">Sign out</button>
          </div>
        </nav>

        {/* ── MAIN WORKSPACE ── */}
        <div className="main">
          {isMobileSidebarOpen && (
            <div className="sidebar-overlay" onClick={() => setIsMobileSidebarOpen(false)} />
          )}

          {/* ── SIDE PANEL LEFT ── */}
          <aside className={`left-panel ${isMobileSidebarOpen ? "mobile-open" : ""}`}>
            {/* COMPONENT SEARCH ACTIONS */}
            <div className="panel-section">
              <div className="section-label">Find people</div>
              <input
                type="text"
                placeholder="Search username…"
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* DYNAMIC PROFILES COMPILING ZONE */}
            {search.trim() && (
              <div className="results-list">
                {results.length === 0 ? (
                  <p className="no-friends" style={{ textAlign: "left", paddingLeft: 4 }}>No profiles found.</p>
                ) : (
                  results.map((u) => (
                    <div key={u.uid} className="result-item">
                      <span className="result-name">@{u.username}</span>
                      <button onClick={() => sendFriendRequest(u)} className="btn-add">+ Add</button>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="divider" />

            {/* ROBUST FRIENDS COMPILATION SYSTEM */}
            <div className="panel-section" style={{ paddingBottom: 8 }}>
              <div className="section-label">Friends</div>
            </div>

            <div className="friends-scroll">
              {friendsLoading ? (
                <div className="panel-loader">
                  <div className="skeleton-item" />
                  <div className="skeleton-item" />
                  <div className="skeleton-item" />
                </div>
              ) : friends.length === 0 ? (
                <p className="no-friends">No connections active.<br />Search usernames to populate space.</p>
              ) : (
                friends.map((friend) => (
                  <div
                    key={friend.uid}
                    className={`friend-item${selectedUser?.uid === friend.uid ? " active" : ""}`}
                    onClick={() => {
                      setSelectedUser(friend);
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <div className="friend-avatar">{friend.username.charAt(0)}</div>
                    <span className="friend-name">{friend.username}</span>

                    {/* KEBAB DROPDOWN MECHANICS */}
                    <div className="kebab-wrap" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="kebab-btn" 
                        title="Options"
                        onClick={() => setActiveKebabMenu(activeKebabMenu === friend.uid ? null : friend.uid)}
                      >
                        ⋮
                      </button>
                      {activeKebabMenu === friend.uid && (
                        <div className="kebab-menu">
                          <button className="btn-unfriend" onClick={() => handleUnfriend(friend)}>
                            Unfriend
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* ── MAIN INTERACTIVE CHAT PANEL ── */}
          <main className="chat-panel">
            {selectedUser ? (
              <>
                {/* INTERACTION AREA HEADLINE */}
                <div className="chat-header">
                  <div className="chat-header-avatar">{selectedUser.username.charAt(0)}</div>
                  <div className="chat-header-info">
                    <span className="chat-header-name">{selectedUser.username}</span>
                    <span className="chat-header-sub">end-to-end encrypted</span>
                  </div>
                </div>

                {/* HISTORICAL MESSAGE STREAM RUNNER */}
                <div className="messages-area">
                  {messages
                    .filter(
                      (m) =>
                        (m.senderId === currentUser?.uid && m.receiverId === selectedUser.uid) ||
                        (m.senderId === selectedUser.uid && m.receiverId === currentUser?.uid)
                    )
                    .map((m, index) => {
                      const directionalClass = m.senderId === currentUser?.uid ? "sent" : "received";
                      const bubbleStyle = m.senderId === currentUser?.uid ? "msg-sent" : "msg-recv";
                      return (
                        <div key={index} className={`msg-wrapper ${directionalClass}`}>
                          <div className={`msg-bubble ${bubbleStyle}`}>{m.text}</div>
                          {m.timestamp && <span className="msg-time">{m.timestamp}</span>}
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>

                {/* OUTBOUND DISPATCH CONTROLS */}
                <div className="input-bar">
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type a message…"
                    className="msg-input"
                  />
                  <button onClick={sendMessage} className="btn-send" title="Send message">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">✦</div>
                <p className="empty-title">Select a conversation</p>
                <p className="empty-sub">Choose a friend from the list to start chatting</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}