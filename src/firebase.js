import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC1JkP7MAM0mvUcs7JY4AqY_3p6s2b8f9y0',
  authDomain: 'footpath-encroachment-demo.firebaseapp.com',
  projectId: 'footpath-encroachment-demo',
  storageBucket: 'footpath-encroachment-demo.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abcdef1234567890'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { collection, addDoc, onSnapshot, updateDoc, doc };
