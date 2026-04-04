import React, { Component, useEffect, useState, useCallback, useRef } from 'react';
import { 
  ref as rtdbRef, 
  onValue as onRtdbValue, 
  set as setRtdbValue,
  remove as removeRtdbValue,
  update as updateRtdbValue
} from 'firebase/database';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  getDocFromServer,
  deleteField,
  runTransaction
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut
} from 'firebase/auth';
import { db, auth, rtdb, googleProvider } from './firebase';
import { 
  Key as KeyIcon, 
  Unlock, 
  Lock, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  User as UserIcon,
  LayoutDashboard,
  History,
  Settings,
  LogOut,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Bell,
  MessageSquare,
  Search,
  Filter,
  X,
  ShieldAlert,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  Users,
  UserMinus,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt: Timestamp;
  deleted?: boolean;
  approved?: boolean;
}

interface KeyData {
  id: string;
  uid: string;
  name: string;
  status: 'available' | 'checked_out' | 'missing';
  currentHolderId?: string;
  currentHolderName?: string;
  expectedReturnTime?: Timestamp;
  lastUpdated: Timestamp;
}

interface CurrentTransaction {
  action: 'checkout' | 'return' | 'none';
  expectedUID: string;
  isPending: boolean;
  userId?: string;
  userName?: string;
  durationMinutes?: number;
  timestamp?: number;
}

interface Booking {
  id: string;
  keyId: string;
  keyName?: string;
  userId: string;
  userName: string;
  startTime: Timestamp;
  endTime: Timestamp;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
}

interface Report {
  id: string;
  keyId: string;
  keyName: string;
  userId: string;
  userName: string;
  description: string;
  createdAt: Timestamp;
  status: 'pending' | 'resolved';
}

interface Notification {
  id: string;
  userId: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  createdAt: Timestamp;
  read: boolean;
}

interface Transaction {
  id: string;
  keyId: string;
  userId: string;
  userName: string;
  action: 'checkout' | 'return';
  timestamp: Timestamp;
  durationMinutes?: number;
}

// --- Error Handling ---

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, setError?: (err: any) => void) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const finalError = new Error(JSON.stringify(errInfo));
  if (setError) {
    setError(finalError);
  } else {
    throw finalError;
  }
}

// --- Components ---

function DurationPicker({ onSelect, onCancel }: { onSelect: (minutes: number) => void, onCancel: () => void }) {
  const presets = [
    { label: '1 Hour', value: 60 },
    { label: '2 Hours', value: 120 },
    { label: '3 Hours', value: 180 },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">How long do you plan to use this room?</p>
      <div className="grid grid-cols-1 gap-3">
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => onSelect(p.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-left hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700 group-hover:text-indigo-700">{p.label}</span>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
            </div>
          </button>
        ))}
      </div>
      <button 
        onClick={onCancel}
        className="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function ExtensionPicker({ onSelect, onCancel }: { onSelect: (minutes: number) => void, onCancel: () => void }) {
  const presets = [
    { label: '5 Min', value: 5 },
    { label: '10 Min', value: 10 },
    { label: '30 Min', value: 30 },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">Extend your room use by:</p>
      <div className="grid grid-cols-2 gap-3">
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => onSelect(p.value)}
            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-center hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
          >
            <span className="font-bold text-slate-700 group-hover:text-indigo-700">{p.label}</span>
          </button>
        ))}
      </div>
      <button 
        onClick={onCancel}
        className="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function CountdownTimer({ targetTime }: { targetTime: Timestamp }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = targetTime.toMillis() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return <span className="font-mono text-indigo-600 font-bold">{timeLeft}</span>;
}

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const errorInfo = JSON.parse(this.state.error.message);
        errorMessage = `Firestore Error: ${errorInfo.error} during ${errorInfo.operationType} on ${errorInfo.path}`;
      } catch (e) {
        errorMessage = this.state.error?.message || String(this.state.error);
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-red-100 text-center">
            <div className="bg-red-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Application Error</h1>
            <p className="text-slate-500 text-sm mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [keys, setKeys] = useState<KeyData[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [pendingTransaction, setPendingTransaction] = useState<CurrentTransaction | null>(null);
  const lastPendingTxRef = useRef<CurrentTransaction | null>(null);
  const [rtdbKeys, setRtdbKeys] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [asyncError, setAsyncError] = useState<any>(null);
  const [historyDate, setHistoryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const [isStandalone, setIsStandalone] = useState(typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (asyncError) throw asyncError;

  // --- Browser Notifications ---
  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }, []);

  useEffect(() => {
    if (user && notificationPermission === 'default') {
      requestNotificationPermission();
    }
  }, [user, notificationPermission, requestNotificationPermission]);

  // Modals
  const [showBookingModal, setShowBookingModal] = useState<string | null>(null);
  const [showEditBookingModal, setShowEditBookingModal] = useState<Booking | null>(null);
  const [showReportModal, setShowReportModal] = useState<string | null>(null);
  const [showAdminKeyModal, setShowAdminKeyModal] = useState<KeyData | null>(null);
  const [showDurationModal, setShowDurationModal] = useState<{ keyUid: string, keyId: string } | null>(null);
  const [showExtensionModal, setShowExtensionModal] = useState<string | null>(null); // keyId

  // --- Connection Test ---
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
          setAsyncError(new Error("Firebase is offline. Please check your configuration."));
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    }
    testConnection();
  }, []);

  // --- Auth ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            if (data.deleted) {
              await signOut(auth);
              setAuthError("Your account has been deleted by an administrator.");
              setUser(null);
              setProfile(null);
            } else {
              // Force admin and approved for frederickigang@gmail.com
              if (firebaseUser.email === 'frederickigang@gmail.com' && (data.role !== 'admin' || !data.approved)) {
                const updatedProfile = { ...data, role: 'admin' as const, approved: true };
                await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin', approved: true });
                setUser(firebaseUser);
                setProfile(updatedProfile);
              } else {
                setUser(firebaseUser);
                setProfile(data);
              }
            }
          } else {
            setUser(firebaseUser);
            // Create profile for new user
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              role: firebaseUser.email === 'frederickigang@gmail.com' ? 'admin' : 'user',
              createdAt: Timestamp.now(),
              approved: firebaseUser.email === 'frederickigang@gmail.com' ? true : false
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);

            // Welcome Notification
            await addNotification(
              firebaseUser.uid, 
              `Welcome to PolyKeyLock, ${newProfile.displayName}!`, 
              'info'
            );
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, firebaseUser ? `users/${firebaseUser.uid}` : 'auth', setAsyncError);
      } finally {
        setIsAuthReady(true);
      }
    });
    return unsubscribe;
  }, []);

  // --- Data Fetching ---

  useEffect(() => {
    if (!isAuthReady || !user || !profile) return;

    setLoading(true);

    // Keys
    const unsubscribeKeys = onSnapshot(collection(db, 'keys'), (snapshot) => {
      setKeys(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as KeyData)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'keys', setAsyncError));

    // Bookings
    const bookingsQuery = profile.role === 'admin' 
      ? query(collection(db, 'bookings'), orderBy('startTime', 'desc'))
      : query(collection(db, 'bookings'), where('userId', '==', user.uid), orderBy('startTime', 'desc'));
    
    const unsubscribeBookings = onSnapshot(bookingsQuery, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Booking)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bookings', setAsyncError));

    // Reports
    const reportsQuery = profile.role === 'admin'
      ? query(collection(db, 'reports'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'reports'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Report)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'reports', setAsyncError));

    // Notifications
    const notificationsQuery = query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    let isInitialLoad = true;
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const newNotifications = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Notification));
      
      // Browser Notification for new unread alerts
      if (!isInitialLoad && 'Notification' in window && Notification.permission === 'granted') {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const notif = change.doc.data() as Notification;
            if (!notif.read) {
              const cleanMessage = notif.message.includes('[extend_') ? notif.message.split('[extend_')[0] : notif.message;
              new Notification("PolyKeyLock Alert", {
                body: cleanMessage,
                icon: "https://ais-dev-zhtasfoudfs3j5dd5e3ubf-245341165106.asia-east1.run.app/favicon.ico",
                tag: notif.id // Prevent duplicate notifications
              });
            }
          }
        });
      }
      
      setNotifications(newNotifications);
      isInitialLoad = false;
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications', setAsyncError));

    // Transactions (Admin only)
    // Transactions
    const transactionsQuery = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions', setAsyncError));

    // Users (Admin only)
    let unsubscribeUsers: (() => void) | undefined;
    if (profile?.role === 'admin') {
      const usersQuery = query(collection(db, 'users'), orderBy('displayName', 'asc'));
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users', setAsyncError));
    }

    // RTDB Current Transaction
    const unsubscribeRtdbTransaction = onRtdbValue(rtdbRef(rtdb, 'currentTransaction'), (snapshot) => {
      setPendingTransaction(snapshot.val());
    });

    // RTDB Keys (for hardware sync)
    const unsubscribeRtdbKeys = onRtdbValue(rtdbRef(rtdb, 'keys'), (snapshot) => {
      const data = snapshot.val() || {};
      setRtdbKeys(data);
    });

    return () => {
      unsubscribeKeys();
      unsubscribeBookings();
      unsubscribeReports();
      unsubscribeNotifications();
      unsubscribeTransactions();
      if (unsubscribeUsers) unsubscribeUsers();
      unsubscribeRtdbTransaction();
      unsubscribeRtdbKeys();
    };
  }, [isAuthReady, user, profile]);

  // --- RTDB to Firestore Sync ---
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (pendingTransaction && pendingTransaction.isPending) {
      lastPendingTxRef.current = pendingTransaction;
      
      // Auto-cancel if it's our transaction and it's been pending for more than 60 seconds
      if (pendingTransaction.userId === user?.uid && pendingTransaction.timestamp) {
        const age = Date.now() - pendingTransaction.timestamp;
        
        const doCancel = async () => {
          try {
            lastPendingTxRef.current = null;
            await setRtdbValue(rtdbRef(rtdb, 'currentTransaction'), {
              action: 'none',
              expectedUID: 'none',
              isPending: false,
              userId: null,
              userName: null,
              timestamp: Date.now()
            });
          } catch (err) {
            console.error("Error auto-cancelling transaction:", err);
          }
        };

        if (age < 60000) {
          timeout = setTimeout(() => {
            doCancel();
          }, 60000 - age);
        } else {
          doCancel();
        }
      }
    } else {
      // Clear it after 5 seconds to avoid race conditions but prevent lingering
      timeout = setTimeout(() => {
        lastPendingTxRef.current = null;
      }, 5000);
    }
    return () => clearTimeout(timeout);
  }, [pendingTransaction, user?.uid]);

  useEffect(() => {
    if (!isAuthReady || !user || !keys.length || Object.keys(rtdbKeys).length === 0) return;

    const syncRtdbToFirestore = async () => {
      for (const key of keys) {
        const rtdbKey = rtdbKeys[key.uid];
        if (rtdbKey) {
          // Check if Firestore needs update
          const isRecentCheckout = lastPendingTxRef.current?.expectedUID === key.uid && 
                                   lastPendingTxRef.current?.action === 'checkout' && 
                                   lastPendingTxRef.current?.timestamp && 
                                   (Date.now() - lastPendingTxRef.current.timestamp < 60000);

          const needsUpdate = 
            rtdbKey.status !== key.status || 
            (rtdbKey.status === 'checked_out' && isRecentCheckout && key.currentHolderId !== lastPendingTxRef.current?.userId) ||
            (rtdbKey.status === 'checked_out' && key.currentHolderId === null && pendingTransaction?.expectedUID === key.uid) ||
            (rtdbKey.expectedReturnTime && (!key.expectedReturnTime || rtdbKey.expectedReturnTime !== key.expectedReturnTime.toMillis()));

          if (needsUpdate) {
            try {
              await runTransaction(db, async (transaction) => {
                const keyRef = doc(db, 'keys', key.id);
                const keyDoc = await transaction.get(keyRef);
                if (!keyDoc.exists()) return null;
                
                const currentKey = keyDoc.data();
                
                let inferredHolderId = rtdbKey.currentHolderId || null;
                let inferredHolderName = rtdbKey.currentHolderName || null;

                // If another client already updated the status and holder, skip to avoid duplicate logs
                if (currentKey.status === rtdbKey.status && currentKey.currentHolderId === inferredHolderId && currentKey.status !== key.status) {
                  return null;
                }

                if (rtdbKey.status === 'checked_out' && !inferredHolderId) {
                  const isRecentLast = lastPendingTxRef.current && lastPendingTxRef.current.expectedUID === key.uid && lastPendingTxRef.current.timestamp && (Date.now() - lastPendingTxRef.current.timestamp < 60000);
                  const isRecentPending = pendingTransaction && pendingTransaction.expectedUID === key.uid && pendingTransaction.timestamp && (Date.now() - pendingTransaction.timestamp < 60000);

                  if (isRecentLast) {
                    inferredHolderId = lastPendingTxRef.current!.userId || null;
                    inferredHolderName = lastPendingTxRef.current!.userName || null;
                  } else if (isRecentPending) {
                    inferredHolderId = pendingTransaction!.userId || null;
                    inferredHolderName = pendingTransaction!.userName || null;
                  } else if (currentKey.status === 'checked_out') {
                    inferredHolderId = currentKey.currentHolderId || null;
                    inferredHolderName = currentKey.currentHolderName || null;
                  }
                }

                // Double check skip logic with the newly inferred holder
                if (currentKey.status === rtdbKey.status && currentKey.currentHolderId === inferredHolderId && currentKey.status !== key.status) {
                  return null;
                }

                const timestamp = Timestamp.now();
                const updateData: any = {
                  status: rtdbKey.status,
                  currentHolderId: inferredHolderId,
                  currentHolderName: inferredHolderName,
                  lastUpdated: timestamp
                };

                if (rtdbKey.expectedReturnTime) {
                  updateData.expectedReturnTime = Timestamp.fromMillis(rtdbKey.expectedReturnTime);
                } else if (rtdbKey.status === 'available') {
                  updateData.expectedReturnTime = deleteField();
                }

                transaction.update(keyRef, updateData);

                // Also log transaction if status changed
                if (rtdbKey.status !== currentKey.status) {
                  const transactionRef = doc(collection(db, 'transactions'));
                  
                  let txUserId = 'unknown';
                  let txUserName = 'Unknown';
                  
                  if (rtdbKey.status === 'checked_out') {
                    txUserId = inferredHolderId || 'unknown';
                    txUserName = inferredHolderName || 'Unknown';
                  } else if (rtdbKey.status === 'available' || rtdbKey.status === 'missing') {
                    txUserId = currentKey.currentHolderId || 'unknown';
                    txUserName = currentKey.currentHolderName || 'Unknown';
                  }

                  const txData: any = {
                    id: transactionRef.id,
                    keyId: key.id,
                    userId: txUserId,
                    userName: txUserName,
                    action: rtdbKey.status === 'checked_out' ? 'checkout' : 'return',
                    timestamp: timestamp
                  };

                  if (rtdbKey.status === 'checked_out' && pendingTransaction?.durationMinutes) {
                    txData.durationMinutes = pendingTransaction.durationMinutes;
                  }

                  transaction.set(transactionRef, txData);
                  return { statusChangedTo: rtdbKey.status, txUserId };
                }
                return null;
              }).then(async (result) => {
                if (result) {
                  // Notify users if key became available
                  if (result.statusChangedTo === 'available') {
                    const pendingBookings = bookings.filter(b => b.keyId === key.id && b.status === 'pending');
                    for (const booking of pendingBookings) {
                      await addNotification(
                        booking.userId,
                        `The key for ${key.name} is now available!`,
                        'info'
                      );
                    }
                  }

                  // Notify users if key became missing
                  if (result.statusChangedTo === 'missing') {
                    const affectedBookings = bookings.filter(b => b.keyId === key.id && (b.status === 'pending' || b.status === 'active'));
                    for (const booking of affectedBookings) {
                      await addNotification(
                        booking.userId,
                        `Alert: The key for ${key.name} has been marked as missing. Your booking may be affected.`,
                        'warning'
                      );
                    }
                  }

                  // Clear current transaction if it was for this key
                  if (pendingTransaction && pendingTransaction.expectedUID === key.uid) {
                    await setRtdbValue(rtdbRef(rtdb, 'currentTransaction'), {
                      action: 'none',
                      expectedUID: 'none',
                      isPending: false
                    });
                  }
                }
              });

            } catch (err) {
              console.error("Error syncing RTDB to Firestore:", err);
            }
          }
        }
      }
    };

    syncRtdbToFirestore();
  }, [rtdbKeys, keys, isAuthReady, user, profile, bookings, pendingTransaction]);

  // --- Late Return Check ---
  useEffect(() => {
    if (!user || !keys.length || !bookings.length) return;

    const checkLateReturns = async () => {
      const now = Timestamp.now();
      
      // Check active bookings
      const userBookings = bookings.filter(b => b.userId === user.uid && b.status === 'active');
      for (const booking of userBookings) {
        if (booking.endTime.toMillis() < now.toMillis()) {
          const alreadyNotified = notifications.some(n => n.type === 'warning' && n.message.includes(booking.id));
          if (!alreadyNotified) {
            await addNotification(
              user.uid,
              `Warning: You have not returned the key for ${keys.find(k => k.id === booking.keyId)?.name}. Booking ID: ${booking.id}`,
              'warning'
            );
          }
        }
      }

      // Check pending bookings to notify when it's time
      const pendingBookings = bookings.filter(b => b.userId === user.uid && b.status === 'pending');
      for (const booking of pendingBookings) {
        const timeUntilStart = booking.startTime.toMillis() - now.toMillis();
        // If booking starts in less than 5 minutes or has already started (but not ended)
        if (timeUntilStart <= 300000 && booking.endTime.toMillis() > now.toMillis()) {
          const key = keys.find(k => k.id === booking.keyId);
          if (key && key.status === 'available') {
            const alreadyNotified = notifications.some(n => n.type === 'info' && n.message.includes(`take_key_${booking.id}`));
            if (!alreadyNotified) {
              await addNotification(
                user.uid,
                `It's time for your booking! You can now take the key for ${key.name}. [take_key_${booking.id}]`,
                'info'
              );
            }
          }
        }
      }

      // Check active checkouts for extension prompt
      const activeCheckouts = keys.filter(k => k.status === 'checked_out' && k.currentHolderId === user.uid && k.expectedReturnTime);
      for (const key of activeCheckouts) {
        if (key.expectedReturnTime) {
          const timeUntilReturn = key.expectedReturnTime.toMillis() - now.toMillis();
          
          // Notify 5 minutes before expiration
          if (timeUntilReturn > 0 && timeUntilReturn < 300000) {
            const alreadyNotified = notifications.some(n => n.type === 'alert' && n.message.includes(`extend_${key.id}`));
            if (!alreadyNotified) {
              await addNotification(
                user.uid,
                `Your time with the ${key.name} key is almost up! Would you like to extend? [extend_${key.id}]`,
                'alert'
              );
            }
          }
        }
      }
    };

    const interval = setInterval(checkLateReturns, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [user, keys, bookings, notifications]);

  // --- Actions ---

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) {
          await updateProfile(userCredential.user, { displayName: name });
          // Ensure the Firestore document gets the correct name
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: userCredential.user.email || '',
            displayName: name,
            role: userCredential.user.email === 'frederickigang@gmail.com' ? 'admin' : 'user',
            createdAt: Timestamp.now(),
            approved: userCredential.user.email === 'frederickigang@gmail.com' ? true : false
          }, { merge: true });
          
          setProfile(prev => prev ? { ...prev, displayName: name } : null);
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed.");
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setAuthError("Please enter your email address to reset your password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthError("Password reset email sent. Please check your inbox.");
    } catch (err: any) {
      setAuthError(err.message || "Failed to send password reset email.");
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || "Google login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      setAsyncError(new Error("Logout failed."));
    }
  };

  const startTransaction = async (keyUid: string, action: 'checkout' | 'return') => {
    if (!user || !profile) return;
    
    if (action === 'checkout') {
      const key = keys.find(k => k.uid === keyUid);
      if (key) {
        setShowDurationModal({ keyUid, keyId: key.id });
      }
      return;
    }

    try {
      await setRtdbValue(rtdbRef(rtdb, 'currentTransaction'), {
        action,
        expectedUID: keyUid,
        isPending: true,
        userId: user.uid,
        userName: profile.displayName,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error("Error starting transaction:", err);
    }
  };

  const confirmCheckout = async (durationMinutes: number) => {
    if (!user || !profile || !showDurationModal) return;
    
    try {
      const expectedReturnTime = Date.now() + (durationMinutes * 60000);
      
      await setRtdbValue(rtdbRef(rtdb, 'currentTransaction'), {
        action: 'checkout',
        expectedUID: showDurationModal.keyUid,
        isPending: true,
        userId: user.uid,
        userName: profile.displayName,
        durationMinutes,
        expectedReturnTime,
        timestamp: Date.now()
      });

      // Also update the key in RTDB immediately so hardware knows the expected return
      await updateRtdbValue(rtdbRef(rtdb, `keys/${showDurationModal.keyUid}`), {
        expectedReturnTime
      });

      setShowDurationModal(null);
    } catch (err) {
      console.error("Error confirming checkout:", err);
    }
  };

  const extendUsage = async (minutes: number) => {
    if (!user || !showExtensionModal) return;
    
    try {
      const key = keys.find(k => k.id === showExtensionModal);
      if (!key || !key.expectedReturnTime) return;

      const newReturnTime = Timestamp.fromMillis(key.expectedReturnTime.toMillis() + (minutes * 60000));
      
      await updateDoc(doc(db, 'keys', key.id), {
        expectedReturnTime: newReturnTime,
        lastUpdated: Timestamp.now()
      });

      // Sync to RTDB
      await updateRtdbValue(rtdbRef(rtdb, `keys/${key.uid}`), {
        expectedReturnTime: newReturnTime.toMillis()
      });

      setShowExtensionModal(null);
      
      // Also mark the notification as read if it was triggered by an alert
      const alertNotif = notifications.find(n => n.userId === user.uid && n.message.includes(`extend_${key.id}`) && !n.read);
      if (alertNotif) {
        await markNotificationRead(alertNotif.id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `keys/${showExtensionModal}`, setAsyncError);
    }
  };

  const cancelTransaction = async () => {
    try {
      lastPendingTxRef.current = null;
      await setRtdbValue(rtdbRef(rtdb, 'currentTransaction'), {
        action: 'none',
        expectedUID: 'none',
        isPending: false,
        userId: null,
        userName: null,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error("Error cancelling transaction:", err);
    }
  };

  const createBooking = async (keyId: string, startTime: Date, endTime: Date) => {
    if (!user || !profile) return;
    try {
      const bookingId = doc(collection(db, 'bookings')).id;
      await setDoc(doc(db, 'bookings', bookingId), {
        id: bookingId,
        keyId,
        userId: user.uid,
        userName: profile.displayName,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        status: 'pending'
      });
      setShowBookingModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bookings', setAsyncError);
    }
  };

  const editBooking = async (id: string, startTime: Date, endTime: Date) => {
    try {
      await updateDoc(doc(db, 'bookings', id), {
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime)
      });
      setShowEditBookingModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`, setAsyncError);
    }
  };

  const cancelBooking = async (id: string, userId: string) => {
    if (profile?.role !== 'admin' && user?.uid !== userId) return;
    if (window.confirm('Are you sure you want to cancel this booking?')) {
      try {
        await updateDoc(doc(db, 'bookings', id), { status: 'cancelled' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`, setAsyncError);
      }
    }
  };

  const reportMissing = async (keyId: string, keyName: string, description: string) => {
    if (!user || !profile) return;
    try {
      const reportId = doc(collection(db, 'reports')).id;
      await setDoc(doc(db, 'reports', reportId), {
        id: reportId,
        keyId,
        keyName,
        userId: user.uid,
        userName: profile.displayName,
        description,
        createdAt: Timestamp.now(),
        status: 'pending'
      });

      // Update key status
      await updateDoc(doc(db, 'keys', keyId), {
        status: 'missing',
        lastUpdated: Timestamp.now()
      });

      // Notify users with active or pending bookings
      const affectedBookings = bookings.filter(b => b.keyId === keyId && (b.status === 'pending' || b.status === 'active'));
      for (const booking of affectedBookings) {
        await addNotification(
          booking.userId,
          `Alert: The key for ${keyName} has been reported missing. Your booking may be affected.`,
          'warning'
        );
      }

      setShowReportModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reports', setAsyncError);
    }
  };

  const adminUpdateKey = async (keyId: string, uid: string, name: string, status: string) => {
    try {
      const oldKey = keys.find(k => k.id === keyId);
      if (oldKey && oldKey.uid !== uid) {
        await removeRtdbValue(rtdbRef(rtdb, `keys/${oldKey.uid}`));
      }

      await updateDoc(doc(db, 'keys', keyId), {
        uid,
        name,
        status,
        lastUpdated: Timestamp.now()
      });

      // Notify users if status changed to missing
      if (status === 'missing' && oldKey?.status !== 'missing') {
        const affectedBookings = bookings.filter(b => b.keyId === keyId && (b.status === 'pending' || b.status === 'active'));
        for (const booking of affectedBookings) {
          await addNotification(
            booking.userId, 
            `Alert: The key for ${name} has been marked as missing by an administrator.`, 
            'warning'
          );
        }
      }

      // Sync to RTDB for ESP8266
      await setRtdbValue(rtdbRef(rtdb, `keys/${uid}`), {
        id: keyId,
        name,
        status,
        currentHolderId: oldKey?.currentHolderId || null,
        currentHolderName: oldKey?.currentHolderName || null
      });

      setShowAdminKeyModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `keys/${keyId}`, setAsyncError);
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`, setAsyncError);
    }
  };

  const deleteBooking = async (id: string) => {
    if (!profile || profile.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'bookings', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookings/${id}`, setAsyncError);
    }
  };

  const updateBookingStatus = async (id: string, status: string) => {
    if (!profile || profile.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`, setAsyncError);
    }
  };

  const updateReportStatus = async (id: string, status: 'pending' | 'resolved') => {
    if (!profile || profile.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'reports', id), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${id}`, setAsyncError);
    }
  };

  const addNotification = async (userId: string, message: string, type: 'info' | 'warning' | 'alert' = 'info') => {
    try {
      const newId = doc(collection(db, 'notifications')).id;
      await setDoc(doc(db, 'notifications', newId), {
        id: newId,
        userId,
        message,
        type,
        createdAt: Timestamp.now(),
        read: false
      });
    } catch (err) {
      console.error("Error adding notification:", err);
    }
  };

  const updateUserRole = async (targetUid: string, newRole: 'admin' | 'user') => {
    if (!profile || profile.role !== 'admin') return;
    if (targetUid === user?.uid) {
      alert("You cannot change your own role.");
      return;
    }
    const targetUser = users.find(u => u.uid === targetUid);
    if (targetUser?.email === 'frederickigang@gmail.com' && newRole !== 'admin') {
      alert("This user is the primary administrator and cannot be demoted.");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', targetUid), { role: newRole });
      addNotification(user!.uid, `User role updated to ${newRole}`, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`, setAsyncError);
    }
  };

  const deleteUser = async (targetUid: string) => {
    if (!profile || profile.role !== 'admin') return;
    if (targetUid === user?.uid) {
      alert("You cannot delete your own account.");
      return;
    }
    const targetUser = users.find(u => u.uid === targetUid);
    if (targetUser?.email === 'frederickigang@gmail.com') {
      alert("This user is the primary administrator and cannot be deleted.");
      return;
    }
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await updateDoc(doc(db, 'users', targetUid), { deleted: true });
        
        // Auto-return any keys held by this user
        const heldKeys = keys.filter(k => k.currentHolderId === targetUid);
        for (const k of heldKeys) {
          await updateDoc(doc(db, 'keys', k.id), {
            status: 'available',
            currentHolderId: null,
            currentHolderName: null,
            lastUpdated: Timestamp.now(),
            expectedReturnTime: deleteField()
          });
          await setRtdbValue(rtdbRef(rtdb, `keys/${k.uid}`), {
            id: k.id,
            name: k.name,
            status: 'available',
            currentHolderId: null,
            currentHolderName: null
          });
          
          // Log return transaction
          const transactionRef = doc(collection(db, 'transactions'));
          await setDoc(transactionRef, {
            id: transactionRef.id,
            keyId: k.id,
            userId: targetUid,
            userName: targetUser?.displayName || 'Unknown',
            action: 'return',
            timestamp: Timestamp.now()
          });
        }

        addNotification(user!.uid, 'User deleted successfully', 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`, setAsyncError);
      }
    }
  };

  const approveUser = async (targetUid: string) => {
    if (!profile || profile.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'users', targetUid), { approved: true });
      await addNotification(targetUid, "Your account has been approved! You can now access the system.", 'info');
      addNotification(user!.uid, 'User approved successfully', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`, setAsyncError);
    }
  };

  const adminResetPassword = async (email: string) => {
    if (!profile || profile.role !== 'admin') return;
    if (window.confirm(`Send password reset email to ${email}?`)) {
      try {
        await sendPasswordResetEmail(auth, email);
        addNotification(user!.uid, `Password reset email sent to ${email}`, 'info');
      } catch (err: any) {
        alert(err.message || "Failed to send password reset email.");
      }
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!profile || profile.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `transactions/${id}`, setAsyncError);
    }
  };

  // --- Render Helpers ---

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Initializing PolyKeyLock...</p>
        </div>
      </div>
    );
  }

  if (user && profile && !profile.approved) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-xl shadow-indigo-100 border border-slate-100 text-center"
        >
          <div className="bg-amber-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-50">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Pending Approval</h1>
          <p className="text-slate-500 mb-8">Your account is waiting for administrator approval. Please check back later.</p>
          <button 
            onClick={handleLogout}
            className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all"
          >
            Sign Out
          </button>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-xl shadow-indigo-100 border border-slate-100 text-center"
        >
          <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
            <KeyIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">PolyKeyLock</h1>
          <p className="text-slate-500 mb-8">Smart Key Cabinet System</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            {authError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl text-left">{authError}</div>}
            {isRegistering && (
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                required
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
              required
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
            {!isRegistering && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full text-sm text-indigo-600 font-medium hover:underline transition-all"
              >
                Forgot Password?
              </button>
            )}
          </form>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">OR</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <button 
            onClick={handleLogin}
            type="button"
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
          
          <p className="mt-6 text-sm text-slate-600">
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-indigo-600 font-bold hover:underline"
            >
              {isRegistering ? 'Sign In' : 'Register'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
            <KeyIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">PolyKeyLock</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={cn(
                "p-2 rounded-full transition-colors relative",
                showNotifications ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-100 text-slate-600"
              )}
            >
              <Bell className="w-6 h-6" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-red-500 border-2 border-white rounded-full" />
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowNotifications(false)}
                    className="fixed inset-0 z-40"
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-50 origin-top-right"
                  >
                    <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                      <h3 className="font-bold text-slate-800">Notifications</h3>
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {notifications.filter(n => !n.read).length} New
                      </span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
                      {notifications.filter(n => !n.read).length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-xs text-slate-400 font-medium">No new notifications</p>
                        </div>
                      ) : (
                        notifications.filter(n => !n.read).map(notif => (
                          <div key={notif.id} className="p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group">
                            <div className="flex gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                                notif.type === 'warning' ? "bg-amber-50 text-amber-600" : 
                                notif.type === 'alert' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                              )}>
                                {notif.type === 'warning' ? <AlertCircle className="w-4 h-4" /> : 
                                 notif.type === 'alert' ? <ShieldAlert className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 leading-tight">
                                  {notif.message.includes('[extend_') ? notif.message.split('[extend_')[0] : notif.message}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {notif.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <button 
                                onClick={() => markNotificationRead(notif.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-indigo-600 transition-all"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            </div>
                            {notif.message.includes('[extend_') && (
                              <button 
                                onClick={() => {
                                  setShowExtensionModal(notif.message.split('[extend_')[1].split(']')[0]);
                                  setShowNotifications(false);
                                }}
                                className="mt-2 w-full py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all"
                              >
                                Extend Now
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.filter(n => !n.read).length > 0 && (
                      <button 
                        onClick={() => {
                          notifications.filter(n => !n.read).forEach(n => markNotificationRead(n.id));
                          setShowNotifications(false);
                        }}
                        className="w-full p-3 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 border-t border-slate-50 transition-all uppercase tracking-widest"
                      >
                        Mark all as read
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-red-50 text-red-600 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-8">
        {/* User Info */}
        <div className="mb-8 flex items-center gap-4">
          <img 
            src={user.photoURL || `https://ui-avatars.com/api/?name=${profile?.displayName}`} 
            className="w-14 h-14 rounded-2xl border-2 border-white shadow-md"
            alt="User"
          />
          <div>
            <h2 className="text-xl font-bold text-slate-800">Hi, {profile?.displayName}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                profile?.role === 'admin' ? "bg-purple-100 text-purple-600" : "bg-indigo-100 text-indigo-600"
              )}>
                {profile?.role}
              </span>
              <span className="text-xs text-slate-400">• Room Access</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
          <TabButton active={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')} icon={<Calendar className="w-4 h-4" />} label="Bookings" />
          <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-4 h-4" />} label="History" />
          <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<ShieldAlert className="w-4 h-4" />} label="Reports" />
          {profile?.role === 'admin' && (
            <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings className="w-4 h-4" />} label="Admin" />
          )}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Browser Notification Prompt */}
              {notificationPermission !== 'granted' && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl text-indigo-600 shadow-sm">
                      <Bell className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">Enable Browser Alerts</h4>
                      <p className="text-xs text-slate-500">
                        {isIOS && !isStandalone 
                          ? "iOS users: Add this app to your Home Screen to enable notifications." 
                          : "Get real-time updates even when the app is in the background."}
                      </p>
                    </div>
                  </div>
                  {(!isIOS || isStandalone) && (
                    <button 
                      onClick={requestNotificationPermission}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 whitespace-nowrap"
                    >
                      Enable Now
                    </button>
                  )}
                </div>
              )}

              {/* Notifications Section */}
              {notifications.filter(n => !n.read).length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Alerts</h3>
                  {notifications.filter(n => !n.read).map(notif => (
                    <div key={notif.id} className={cn(
                      "p-4 rounded-2xl border flex gap-4 items-start",
                      notif.type === 'warning' ? "bg-amber-50 border-amber-100 text-amber-900" : "bg-blue-50 border-blue-100 text-blue-900"
                    )}>
                      {notif.type === 'warning' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <Info className="w-5 h-5 shrink-0" />}
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {notif.message.includes('[extend_') ? (
                            <>
                              {notif.message.split('[extend_')[0]}
                              <button 
                                onClick={() => setShowExtensionModal(notif.message.split('[extend_')[1].split(']')[0])}
                                className="mx-1 px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all"
                              >
                                Extend Now
                              </button>
                            </>
                          ) : notif.message}
                        </p>
                        <button 
                          onClick={() => markNotificationRead(notif.id)}
                          className="text-xs font-bold mt-2 underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Keys Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {keys.map(key => {
                  const rtdbKey = rtdbKeys[key.uid];
                  const status = rtdbKey?.status || key.status;
                  const holderId = rtdbKey?.currentHolderId || key.currentHolderId;
                  const holderName = rtdbKey?.currentHolderName || key.currentHolderName;
                  const expectedReturn = key.expectedReturnTime;

                  return (
                    <div key={key.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div className={cn(
                          "p-3 rounded-2xl",
                          status === 'available' ? "bg-emerald-50 text-emerald-600" : 
                          status === 'checked_out' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                        )}>
                          {status === 'available' ? <Lock className="w-6 h-6" /> : 
                           status === 'checked_out' ? <Unlock className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg",
                            status === 'available' ? "bg-emerald-100 text-emerald-700" : 
                            status === 'checked_out' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {status.replace('_', ' ')}
                          </span>
                          {status === 'checked_out' && (
                            <span className="text-[10px] text-slate-400 mt-1">
                              Held by {holderName || 'Unknown'}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-slate-800">{key.name}</h3>
                        {status === 'checked_out' && expectedReturn && (
                          <div className="mt-2 flex items-center gap-2 text-amber-600">
                            <Clock className="w-4 h-4" />
                            <CountdownTimer targetTime={expectedReturn} />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {status === 'available' ? (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => startTransaction(key.uid, 'checkout')}
                              className="flex-[2] bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                            >
                              Take Key <ChevronRight className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setShowBookingModal(key.id)}
                              className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
                              title="Book for Later"
                            >
                              <Calendar className="w-4 h-4" />
                            </button>
                          </div>
                        ) : status === 'checked_out' && holderId === user.uid ? (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => startTransaction(key.uid, 'return')}
                              className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-100"
                            >
                              Return <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setShowExtensionModal(key.id)}
                              className="px-4 bg-amber-100 text-amber-700 py-3 rounded-xl font-bold hover:bg-amber-200 transition-all"
                              title="Extend Usage"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setShowBookingModal(key.id)}
                            className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
                          >
                            Book for Later <Calendar className="w-4 h-4" />
                          </button>
                        )}
                        
                        <button 
                          onClick={() => setShowReportModal(key.id)}
                          className="text-xs text-slate-400 font-medium hover:text-red-500 transition-colors py-2"
                        >
                          Report Missing?
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'bookings' && (
            <motion.div 
              key="bookings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <h3 className="text-lg font-bold text-slate-800">{profile?.role === 'admin' ? 'All Reservations' : 'My Reservations'}</h3>
              {bookings.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 border border-dashed border-slate-200 text-center">
                  <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">No bookings found.</p>
                </div>
              ) : (
                bookings.map(booking => (
                  <div key={booking.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">{keys.find(k => k.id === booking.keyId)?.name || 'Unknown Room'}</h4>
                        <div className="flex flex-col gap-0.5">
                          {profile?.role === 'admin' && (
                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">User: {booking.userName}</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-medium">
                            Pickup: {booking.startTime.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            Return: {booking.endTime.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {booking.status === 'pending' && booking.userId === user?.uid && (
                        <div className="flex items-center gap-1 mr-2">
                          <button 
                            onClick={() => setShowEditBookingModal(booking)}
                            className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Booking"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => cancelBooking(booking.id, booking.userId)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Cancel Booking"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {profile?.role === 'admin' && (
                        <div className="flex items-center gap-1 mr-2">
                          {booking.status === 'pending' && (
                            <button 
                              onClick={() => updateBookingStatus(booking.id, 'active')}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Approve/Activate"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => deleteBooking(booking.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Booking"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg",
                        booking.status === 'pending' ? "bg-blue-100 text-blue-700" : 
                        booking.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                      )}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-slate-800">Key Usage History</h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input 
                      type="date" 
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Live</span>
                  </div>
                </div>
              </div>

              {keys.map(key => {
                const keyTransactions = transactions.filter(t => {
                  const tDate = t.timestamp.toDate().toISOString().split('T')[0];
                  return t.keyId === key.id && tDate === historyDate;
                });
                if (keyTransactions.length === 0) return null;

                return (
                  <div key={key.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                      <div className="bg-slate-100 p-2 rounded-xl">
                        <KeyIcon className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">{key.name}</h4>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">UID: {key.uid}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {keyTransactions.map((t, idx) => (
                        <div key={t.id} className="flex gap-4 items-start relative">
                          {idx !== keyTransactions.length - 1 && (
                            <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-slate-50" />
                          )}
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10",
                            t.action === 'checkout' ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                          )}>
                            {t.action === 'checkout' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-bold text-slate-700 truncate">
                                {t.userName}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                  {t.timestamp.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {profile?.role === 'admin' && (
                                  <button 
                                    onClick={() => deleteTransaction(t.id)}
                                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                    title="Delete Log"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {t.action === 'checkout' ? 'Took the key' : 'Returned the key'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {transactions.length === 0 && (
                <div className="bg-white rounded-3xl p-12 border border-dashed border-slate-200 text-center">
                  <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">No transactions recorded yet.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <h3 className="text-lg font-bold text-slate-800">Missing Key Reports</h3>
              {reports.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 border border-dashed border-slate-200 text-center">
                  <ShieldAlert className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">No reports filed.</p>
                </div>
              ) : (
                reports.map(report => (
                  <div key={report.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-slate-800">{report.keyName}</h4>
                      <div className="flex items-center gap-2">
                        {profile?.role === 'admin' && (
                          <button 
                            onClick={() => updateReportStatus(report.id, report.status === 'pending' ? 'resolved' : 'pending')}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              report.status === 'pending' ? "text-emerald-600 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50"
                            )}
                            title={report.status === 'pending' ? "Mark as Resolved" : "Mark as Pending"}
                          >
                            {report.status === 'pending' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                          </button>
                        )}
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg",
                          report.status === 'pending' ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {report.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">{report.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      <span>Reported by {report.userName}</span>
                      <span>{report.createdAt.toDate().toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'admin' && profile?.role === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">Manage Keys</h3>
                  <button 
                    onClick={() => setShowAdminKeyModal({ id: '', uid: '', name: '', status: 'available', lastUpdated: Timestamp.now() })}
                    className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                  {keys.map((key, i) => (
                    <div key={key.id} className={cn(
                      "p-4 flex items-center justify-between",
                      i !== keys.length - 1 && "border-b border-slate-50"
                    )}>
                      <div>
                        <h4 className="font-bold text-slate-800">{key.name}</h4>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                          {key.status} • UID: {key.uid}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setShowAdminKeyModal(key)}
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('Delete this key?')) {
                              try {
                                if (key.uid) {
                                  await removeRtdbValue(rtdbRef(rtdb, `keys/${key.uid}`));
                                }
                                await deleteDoc(doc(db, 'keys', key.id));
                              } catch (err) {
                                console.error("Error deleting key:", err);
                              }
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800">Manage Users</h3>
                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                  {users.filter(u => !u.deleted).map((u, i, arr) => (
                    <div key={u.uid} className={cn(
                      "p-4 flex items-center justify-between",
                      i !== arr.length - 1 && "border-b border-slate-50"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          u.role === 'admin' ? "bg-indigo-50 text-indigo-600" : "bg-slate-50 text-slate-600"
                        )}>
                          {u.role === 'admin' ? <UserPlus className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{u.displayName}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                            {u.role} • {u.email} {!u.approved && '• PENDING'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!u.approved && (
                          <button
                            onClick={() => approveUser(u.uid)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-xl transition-colors"
                            title="Approve User"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                        )}
                        {u.uid !== user?.uid && (
                          <>
                            <button 
                              onClick={() => adminResetPassword(u.email)}
                              className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                              title="Reset Password"
                            >
                              <KeyRound className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => updateUserRole(u.uid, u.role === 'admin' ? 'user' : 'admin')}
                              className={cn(
                                "p-2 rounded-xl transition-all",
                                u.role === 'admin' ? "text-amber-500 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                              )}
                              title={u.role === 'admin' ? "Remove Admin" : "Make Admin"}
                            >
                              {u.role === 'admin' ? <UserMinus className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                            </button>
                            <button 
                              onClick={() => deleteUser(u.uid)}
                              className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                              title="Delete User"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800">Recent Transactions</h3>
                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                  {transactions.map((tx, i) => (
                    <div key={tx.id} className={cn(
                      "p-4 flex items-center justify-between",
                      i !== transactions.length - 1 && "border-b border-slate-50"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          tx.action === 'checkout' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {tx.action === 'checkout' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{tx.userName}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                            {tx.action} • {keys.find(k => k.id === tx.keyId)?.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {tx.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showBookingModal && (
          <Modal onClose={() => setShowBookingModal(null)} title="Book Room Key">
            <BookingForm 
              onSubmit={(start, end) => createBooking(showBookingModal, start, end)} 
              onCancel={() => setShowBookingModal(null)} 
            />
          </Modal>
        )}

        {showEditBookingModal && (
          <Modal onClose={() => setShowEditBookingModal(null)} title="Edit Booking">
            <BookingForm 
              initialStart={showEditBookingModal.startTime.toDate()}
              initialEnd={showEditBookingModal.endTime.toDate()}
              onSubmit={(start, end) => editBooking(showEditBookingModal.id, start, end)} 
              onCancel={() => setShowEditBookingModal(null)} 
            />
          </Modal>
        )}

        {showReportModal && (
          <Modal onClose={() => setShowReportModal(null)} title="Report Missing Key">
            <ReportForm 
              onSubmit={(desc) => reportMissing(showReportModal, keys.find(k => k.id === showReportModal)?.name || '', desc)} 
              onCancel={() => setShowReportModal(null)} 
            />
          </Modal>
        )}

        {showAdminKeyModal && (
          <Modal onClose={() => setShowAdminKeyModal(null)} title={showAdminKeyModal.id ? "Edit Key" : "Add Key"}>
            <AdminKeyForm 
              initialData={showAdminKeyModal}
              onSubmit={async (uid, name, status) => {
                try {
                  if (showAdminKeyModal.id) {
                    await adminUpdateKey(showAdminKeyModal.id, uid, name, status);
                  } else {
                    const id = doc(collection(db, 'keys')).id;
                    await setDoc(doc(db, 'keys', id), {
                      id, uid, name, status, lastUpdated: Timestamp.now()
                    });
                    
                    // Sync to RTDB for ESP8266
                    await setRtdbValue(rtdbRef(rtdb, `keys/${uid}`), {
                      id,
                      name,
                      status,
                      currentHolderId: null,
                      currentHolderName: null
                    });

                    setShowAdminKeyModal(null);
                  }
                } catch (err) {
                  console.error("Error saving key:", err);
                }
              }}
              onCancel={() => setShowAdminKeyModal(null)}
            />
          </Modal>
        )}

        {showDurationModal && (
          <Modal onClose={() => setShowDurationModal(null)} title="Select Duration">
            <DurationPicker 
              onSelect={confirmCheckout} 
              onCancel={() => setShowDurationModal(null)} 
            />
          </Modal>
        )}

        {showExtensionModal && (
          <Modal onClose={() => setShowExtensionModal(null)} title="Extend Key Usage">
            <ExtensionPicker 
              onSelect={extendUsage} 
              onCancel={() => setShowExtensionModal(null)} 
            />
          </Modal>
        )}

        {pendingTransaction?.isPending && pendingTransaction.userId === user?.uid && (
          <Modal onClose={cancelTransaction} title="Hardware Transaction">
            <div className="text-center py-8">
              <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Clock className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Waiting for Hardware Scan</h3>
              <p className="text-slate-500 text-sm mb-6">
                Please scan your key on the ESP8266 device to complete the {pendingTransaction.action === 'checkout' ? 'checkout' : 'return'}.
              </p>
              <button 
                onClick={cancelTransaction}
                className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Cancel Transaction
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 px-8 py-4 flex items-center justify-between z-40">
        <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-6 h-6" />} label="Home" />
        <NavButton active={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')} icon={<Calendar className="w-6 h-6" />} label="Bookings" />
        <NavButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<ShieldAlert className="w-6 h-6" />} label="Reports" />
        {profile?.role === 'admin' && (
          <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings className="w-6 h-6" />} label="Admin" />
        )}
      </nav>
    </div>
  );
}

// --- Sub-components ---

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
        active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white text-slate-400 border border-slate-100"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-indigo-600 scale-110" : "text-slate-400"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
      {active && (
        <motion.div layoutId="nav-indicator" className="w-1 h-1 bg-indigo-600 rounded-full mt-0.5" />
      )}
    </button>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode, onClose: () => void, title: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function BookingForm({ onSubmit, onCancel, initialStart, initialEnd }: { onSubmit: (start: Date, end: Date) => void, onCancel: () => void, initialStart?: Date, initialEnd?: Date }) {
  const formatForInput = (date: Date) => {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const [start, setStart] = useState(initialStart ? formatForInput(initialStart) : '');
  const [end, setEnd] = useState(initialEnd ? formatForInput(initialEnd) : '');

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pickup Time</label>
        <input 
          type="datetime-local" 
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Return Time</label>
        <input 
          type="datetime-local" 
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button onClick={onCancel} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
        <button 
          onClick={() => onSubmit(new Date(start), new Date(end))}
          disabled={!start || !end}
          className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function ReportForm({ onSubmit, onCancel }: { onSubmit: (desc: string) => void, onCancel: () => void }) {
  const [desc, setDesc] = useState('');

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
        <textarea 
          placeholder="Describe the situation..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-32 resize-none"
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button onClick={onCancel} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
        <button 
          onClick={() => onSubmit(desc)}
          disabled={!desc}
          className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all disabled:opacity-50"
        >
          Submit Report
        </button>
      </div>
    </div>
  );
}

function AdminKeyForm({ initialData, onSubmit, onCancel }: { initialData: KeyData, onSubmit: (uid: string, name: string, status: string) => void, onCancel: () => void }) {
  const [uid, setUid] = useState(initialData.uid || '');
  const [name, setName] = useState(initialData.name);
  const [status, setStatus] = useState(initialData.status);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Key UID (Hardware ID) <span className="text-red-500">*</span></label>
        <input 
          type="text" 
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="e.g. A1 B2 C3 D4"
          required
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Room Name <span className="text-red-500">*</span></label>
        <input 
          type="text" 
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
        <select 
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        >
          <option value="available">Available</option>
          <option value="checked_out">Checked Out</option>
          <option value="missing">Missing</option>
        </select>
      </div>
      <div className="flex gap-3 pt-4">
        <button onClick={onCancel} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
        <button 
          onClick={() => onSubmit(uid, name, status)}
          disabled={!name || !uid}
          className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          Save Key
        </button>
      </div>
    </div>
  );
}
