import React, { useEffect, useMemo, useState } from 'react';
import { db, collection, addDoc, onSnapshot, updateDoc, doc } from './firebase';

const STORAGE_KEY = 'footpath-encroachments-demo';
const CHANNEL_NAME = 'footpath-encroachments-channel';

const readStoredComplaints = () => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const persistComplaints = (items) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const broadcastComplaints = (items) => {
  if (typeof window === 'undefined') return;

  persistComplaints(items);

  if ('BroadcastChannel' in window) {
    const channel = new window.BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(items);
    channel.close();
  }

  window.dispatchEvent(new CustomEvent('footpath-complaints-updated', { detail: items }));
};

const initialForm = {
  name: '',
  phone: '',
  encroachmentType: 'Vehicle Parking',
  description: '',
  beforeImage: ''
};

const authorityForm = {
  name: '',
  adminId: ''
};

function App() {
  const [page, setPage] = useState('home');
  const [publicForm, setPublicForm] = useState(initialForm);
  const [authorityCredentials, setAuthorityCredentials] = useState(authorityForm);
  const [complaints, setComplaints] = useState(readStoredComplaints);
  const [activeUser, setActiveUser] = useState(null);
  const [activeAuthority, setActiveAuthority] = useState(null);
  const [message, setMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'complaints'),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setComplaints(data);
        broadcastComplaints(data);
      },
      (error) => {
        console.error('Firestore unavailable, using local fallback.', error);
        const localComplaints = readStoredComplaints();
        setComplaints(localComplaints);
        setMessage('Live database sync is unavailable, so reports are being shown from local storage.');
      }
    );

    if (typeof window === 'undefined') {
      return () => unsubscribe();
    }

    const handleStorageSync = (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue);
        if (Array.isArray(data)) {
          setComplaints(data);
        }
      } catch {
        // Ignore invalid stored data.
      }
    };

    const handleBroadcast = (event) => {
      if (Array.isArray(event.detail)) {
        setComplaints(event.detail);
      }
    };

    const handleChannelMessage = (event) => {
      if (Array.isArray(event.data)) {
        setComplaints(event.data);
      }
    };

    const channel = 'BroadcastChannel' in window ? new window.BroadcastChannel(CHANNEL_NAME) : null;
    channel?.addEventListener('message', handleChannelMessage);

    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('footpath-complaints-updated', handleBroadcast);

    return () => {
      unsubscribe();
      channel?.removeEventListener('message', handleChannelMessage);
      channel?.close();
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('footpath-complaints-updated', handleBroadcast);
    };
  }, []);

  useEffect(() => {
    if (page === 'authority-dashboard' && activeAuthority) {
      complaints.forEach((item) => {
        if (item.status === 'Sent') {
          updateDoc(doc(db, 'complaints', item.id), { status: 'Received' });
        }
      });
    }
  }, [page, activeAuthority, complaints]);

  const userComplaints = useMemo(() => {
    if (!activeUser?.phone) return [];
    return complaints.filter((item) => item.phone === activeUser.phone);
  }, [activeUser, complaints]);

  const pendingComplaints = useMemo(() => complaints.filter((item) => item.status !== 'Resolved'), [complaints]);

  const handlePublicLogin = (event) => {
    event.preventDefault();
    const trimmedName = publicForm.name.trim();
    const trimmedPhone = publicForm.phone.trim();

    if (!trimmedName || !trimmedPhone) {
      setMessage('Please enter your name and phone number.');
      return;
    }

    setActiveUser({ name: trimmedName, phone: trimmedPhone });
    setMessage('');
    setPage('public-report');
  };

  const handlePublicSubmit = (event) => {
    event.preventDefault();
    const trimmedName = publicForm.name.trim();
    const trimmedPhone = publicForm.phone.trim();
    const description = publicForm.description.trim();

    if (!trimmedName || !trimmedPhone || !description || !publicForm.beforeImage) {
      setMessage('Please complete all fields and upload a before image.');
      return;
    }

    if (description.length > 50) {
      setMessage('Description must be 50 characters or fewer.');
      return;
    }

    const payload = {
      id: Date.now(),
      name: trimmedName,
      phone: trimmedPhone,
      encroachmentType: publicForm.encroachmentType,
      description,
      beforeImage: publicForm.beforeImage,
      status: 'Sent',
      adminNote: 'Awaiting review by GVMC authority.',
      createdAt: new Date().toLocaleString()
    };

    const nextComplaints = [payload, ...readStoredComplaints()];
    broadcastComplaints(nextComplaints);
    setComplaints(nextComplaints);

    addDoc(collection(db, 'complaints'), payload)
      .catch(() => setMessage('Could not save to the database. The report is still visible locally for the current session.'));
    setPublicForm((current) => ({ ...current, description: '', beforeImage: '' }));
    setMessage('');
    setStatusMessage('Your encroachment report has been sent to the authority team.');
    setPage('public-status');
  };

  const handleAuthorityLogin = (event) => {
    event.preventDefault();
    const trimmedName = authorityCredentials.name.trim();
    const trimmedAdminId = authorityCredentials.adminId.trim();

    if (!trimmedName || !trimmedAdminId) {
      setMessage('Please enter both your name and admin ID or email.');
      return;
    }

    setActiveAuthority({ name: trimmedName, adminId: trimmedAdminId });
    setMessage('');
    setPage('authority-dashboard');
  };

  const resolveComplaint = (id) => {
    const updatedComplaints = complaints.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        status: 'Resolved',
        adminNote: 'Issue resolved and shared with the resident.'
      };
    });

    setComplaints(updatedComplaints);
    broadcastComplaints(updatedComplaints);

    updateDoc(doc(db, 'complaints', id), {
      status: 'Resolved',
      adminNote: 'Issue resolved and shared with the resident.'
    }).catch(() => setMessage('The report was updated locally, but the live database could not be reached.'));
    setStatusMessage('The report has been marked resolved.');
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPublicForm((current) => ({ ...current, beforeImage: reader.result }));
    };
    reader.readAsDataURL(file);
    
  };

  const resetToHome = () => {
    setPage('home');
    setPublicForm(initialForm);
    setAuthorityCredentials(authorityForm);
    setActiveUser(null);
    setActiveAuthority(null);
    setMessage('');
    setStatusMessage('');
  };

  return (
    <div className="app-shell">
      <header className="hero-card">
        
        <h1>Footpath Encroachment Mapping</h1>
        <p className="hero-copy">Capture encroachments, raise complaints, and let GVMC authorities track the issue end-to-end.</p>
        <div className="hero-actions">
          <button className="primary-btn" onClick={() => setPage('public-login')}>Public Login</button>
          <button className="secondary-btn" onClick={() => setPage('authority-login')}>Authority Login</button>
        </div>
      </header>

      {message ? <div className="banner">{message}</div> : null}
      {statusMessage ? <div className="banner success">{statusMessage}</div> : null}

      {page === 'home' ? (
        <section className="info-grid">
          <article className="card">
            <h2>For residents</h2>
            <p>Log a footpath encroachment, upload a before photo, and receive a complaint ID for future tracking.</p>
          </article>
          <article className="card">
            <h2>For GVMC teams</h2>
            <p>Review incoming reports, resolve issues, and keep a visible action trail for every complaint.</p>
          </article>
        </section>
      ) : null}

      {page === 'public-login' ? (
        <section className="card form-card">
          <h2>Public Login</h2>
          <form onSubmit={handlePublicLogin}>
            <label>
              Name
              <input value={publicForm.name} onChange={(event) => setPublicForm((current) => ({ ...current, name: event.target.value }))} placeholder="Enter your name" />
            </label>
            <label>
              Phone Number
              <input value={publicForm.phone} onChange={(event) => setPublicForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Enter phone number" />
            </label>
            <button className="primary-btn" type="submit">Continue</button>
          </form>
        </section>
      ) : null}

      {page === 'public-report' ? (
        <section className="card form-card">
          <div className="section-head">
            <h2>Report Encroachment</h2>
            <button className="text-btn" onClick={() => setPage('public-status')}>View status</button>
          </div>
          <form onSubmit={handlePublicSubmit}>
            <label>
              Name
              <input value={publicForm.name} onChange={(event) => setPublicForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Phone Number
              <input value={publicForm.phone} onChange={(event) => setPublicForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              Encroachment Type
              <select value={publicForm.encroachmentType} onChange={(event) => setPublicForm((current) => ({ ...current, encroachmentType: event.target.value }))}>
                <option>Vehicle Parking</option>
                <option>Vendor Stall</option>
                <option>Material Dumping</option>
                <option>Temporary Construction</option>
              </select>
            </label>
            <label>
              Encroachment Description
              <textarea maxLength="50" value={publicForm.description} onChange={(event) => setPublicForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe the issue in 50 characters or fewer" />
              <small>{publicForm.description.length}/50 characters</small>
            </label>
            <label>
              Before Image Upload
              <input type="file" accept="image/*" onChange={handleImageUpload} />
            </label>
            {publicForm.beforeImage ? <img className="preview-image" src={publicForm.beforeImage} alt="Before upload preview" /> : null}
            <button className="primary-btn" type="submit">Send to Authority</button>
          </form>
        </section>
      ) : null}

      {page === 'public-status' ? (
        <section className="card form-card">
          <div className="section-head">
            <h2>Your Reports</h2>
            <button className="text-btn" onClick={() => setPage('public-report')}>Back to form</button>
          </div>
          {userComplaints.length === 0 ? (
            <p>No complaints submitted yet. Use the report form to create one.</p>
          ) : (
            <div className="list-stack">
              {userComplaints.map((item) => (
                <article key={item.id} className="report-card">
                  <div className="report-row"><strong>Type:</strong> {item.encroachmentType}</div>
                  <div className="report-row"><strong>Description:</strong> {item.description}</div>
                  <div className="report-row"><strong>Status:</strong> {item.status}</div>
                  <div className="report-row"><strong>Authority Note:</strong> {item.adminNote}</div>
                  {item.beforeImage ? <img className="preview-image" src={item.beforeImage} alt="Before upload" /> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {page === 'authority-login' ? (
        <section className="card form-card">
          <h2>Authority Login</h2>
          <form onSubmit={handleAuthorityLogin}>
            <label>
              Authority Name
              <input value={authorityCredentials.name} onChange={(event) => setAuthorityCredentials((current) => ({ ...current, name: event.target.value }))} placeholder="Enter your name" />
            </label>
            <label>
              Admin ID / Email
              <input value={authorityCredentials.adminId} onChange={(event) => setAuthorityCredentials((current) => ({ ...current, adminId: event.target.value }))} placeholder="Enter admin ID or email" />
            </label>
            <button className="primary-btn" type="submit">Open Dashboard</button>
          </form>
        </section>
      ) : null}

      {page === 'authority-dashboard' ? (
        <section className="card form-card">
          <div className="section-head">
            <h2>Authority Dashboard</h2>
            <div className="pill">Signed in as {activeAuthority?.name}</div>
          </div>
          {pendingComplaints.length === 0 ? (
            <p>No pending complaints right now.</p>
          ) : (
            <div className="list-stack">
              {pendingComplaints.map((item) => (
                <article key={item.id} className="report-card">
                  <div className="report-row"><strong>Resident:</strong> {item.name}</div>
                  <div className="report-row"><strong>Phone:</strong> {item.phone}</div>
                  <div className="report-row"><strong>Type:</strong> {item.encroachmentType}</div>
                  <div className="report-row"><strong>Issue:</strong> {item.description}</div>
                  <div className="report-row"><strong>Status:</strong> {item.status}</div>
                  <div className="report-row"><strong>Note:</strong> {item.adminNote}</div>
                  {item.beforeImage ? <img className="preview-image" src={item.beforeImage} alt="Complaint preview" /> : null}
                  <button className="primary-btn" onClick={() => resolveComplaint(item.id)}>Mark Resolved</button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <footer className="footer-actions">
        <button className="secondary-btn" onClick={resetToHome}>Back to Home</button>
      </footer>
    </div>
  );
}

export default App;
