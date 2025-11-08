import { initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"
import { getStorage, type FirebaseStorage } from "firebase/storage"

const getEnvVar = (key: string, fallback: string): string => {
  const value = process.env[key]
  return value && value.trim() !== "" ? value : fallback
}

const firebaseConfig = {
  apiKey: getEnvVar("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyCYF_zBDmoGEOimkn0kboLFzCmJYD5oXXI"),
  authDomain: getEnvVar("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "seating-arrangement-20ffd.firebaseapp.com"),
  projectId: getEnvVar("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "seating-arrangement-20ffd"),
  storageBucket: getEnvVar("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "seating-arrangement-20ffd.firebasestorage.app"),
  messagingSenderId: getEnvVar("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "408869336393"),
  appId: getEnvVar("NEXT_PUBLIC_FIREBASE_APP_ID", "1:408869336393:web:e46de517e7b7813331d698"),
  measurementId: getEnvVar("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", "G-K93CX57T5F"),
}

const isConfigValid = () => {
  const isValid =
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.length > 10 &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId

  if (!isValid) {
    console.error("[v0] Firebase configuration validation failed:", {
      hasApiKey: !!firebaseConfig.apiKey,
      apiKeyLength: firebaseConfig.apiKey?.length,
      hasAuthDomain: !!firebaseConfig.authDomain,
      hasProjectId: !!firebaseConfig.projectId,
    })
  }

  return isValid
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let firestore: Firestore | null = null
let storage: FirebaseStorage | null = null

if (isConfigValid()) {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    firestore = getFirestore(app)
    storage = getStorage(app)
    console.log("[v0] Firebase initialized successfully with project:", firebaseConfig.projectId)
  } catch (error) {
    console.error("[v0] Firebase initialization error:", error)
  }
} else {
  console.error("[v0] Firebase configuration is incomplete. Using fallback credentials.")
}

export const isFirebaseInitialized = () => app !== null && auth !== null && firestore !== null

export { auth, firestore, storage, app }
