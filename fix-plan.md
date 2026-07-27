# Fix Plan: Auth, Multi-Ward & 401 Issues

## Problem Summary

1. **401 Unauthorized** — JWT expires after 24h; no refresh mechanism. All protected API calls fail silently after expiry. `Payment.jsx`, `Reports.jsx`, `Dashboard.jsx`, and guardian pages show blank/₹0/error.
2. **Guardian multiple children blocked** — `signup.js:39-44` rejects duplicate mobile/email. No way for a parent to add a second child after initial registration. No "Add Ward" API or UI exists.
3. **Signup UX failure** — Parent with one child who tries to register another gets "User with this mobile or email already exists" with no alternative path.

---

## Fix 1: JWT Expiry — Auto-Refresh & Interceptor

**Problem:** `tokens.js:5` sets `expiresIn: '24h'`. After expiry, `rbca.js:25` returns 401. No frontend interceptor catches this.

### Backend Changes

**1a. Add refresh token endpoint** — `POST /api/auth/refresh-token`

File: `apps/api/src/controllers/auth.js` — add handler:
```
refreshToken (req, res) {
  const { token } = req.body;
  verifyToken(token) — ignore expiry
  lookup user by decoded.id
  if user not found → 401
  generate NEW token with fresh 24h
  return { token }
}
```

File: `apps/api/src/index.js` (line ~60) — add route:
```
app.post('/api/auth/refresh-token', authRateLimiter, authController.refreshToken);
```

**1b. Refresh only calls on expiry** — don't alter auth rate limiting (refresh is unauthenticated but rate-limited).

### Frontend Changes

**1c. Axios response interceptor** — `apps/web/src/api/client.js`:

```js
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const oldToken = localStorage.getItem('token');
        const res = await axios.post('/api/auth/refresh-token', { token: oldToken });
        const newToken = res.data.token;
        localStorage.setItem('token', newToken);
        setAuthToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        // refresh failed — force logout
        useAuthStore.getState().logout();
        window.location.href = '/';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
```

**`_retry` prevents infinite retry loops.**

---

## Fix 2: Allow Parents to Add Multiple Children (Wards)

**Problem:** No `POST /api/guardians/students` endpoint exists. Student creation only happens during initial signup (`signup.js:73-84`).

### Backend Changes

**2a. New endpoint: `POST /api/guardians/students`** — authenticated, role guardian/admin

File: `apps/api/src/controllers/auth.js` — add handler:
```
addStudent (req, res) {
  extract { name, class, dob } from req.body
  validate required fields
  student = prisma.student.create({
    guardianId: req.user.id,
    name, class, dob: new Date(dob),
    status: 'pending',
    consentChecked: true,
    consentTimestamp: new Date()
  })
  logAudit({ actorId: req.user.id, action: 'add_student', ... })
  return 201 { student }
}
```

File: `apps/api/src/index.js` (guardian routes section) — add:
```
app.post('/api/guardians/students', authenticate, checkRole(['guardian','admin']), authController.addStudent);
```

**2b. Existing `GET /api/guardians/students` already returns all wards** — `auth.js:218`. No change needed.

**2c. Signup must still work for first-time users.** `signup.js` stays unchanged.

### Frontend Changes

**2d. "Add Ward" button + modal** — `apps/web/src/pages/guardian/AddWard.jsx` (new component):

```
- Button labeled "+ Add Ward / Another Child"
- Modal form with: student name, class (dropdown), date of birth
- POSTs to /api/guardians/students
- On success: refetch student list, toast "Ward added successfully"
- On error: show error inline
```

**2e. Integrate into guardian's existing pages:**

Option A: Button in `Payment.jsx` (above student selector, line 95 area):
```jsx
{students.length > 0 && (
  <button onClick={openAddWardModal}>+ Add Ward</button>
)}
```

Option B: Button in `App.jsx` guardian tab section (near line 181, beside "Your Linked Students" heading).

**Recommend: Option A** — it's where the parent already manages children.

**2f. AddWard modal state** in `Payment.jsx`:
```
const [showAddWard, setShowAddWard] = useState(false);
const [wardForm, setWardForm] = useState({ name: '', class: 'Grade 1-A', dob: '' });
const [addingWard, setAddingWard] = useState(false);
const [wardError, setWardError] = useState(null);
```

After successful add, re-fetch students:
```js
const res = await api.post('/guardians/students', wardForm);
const updated = await api.get('/guardians/students');  // refetch
setStudents(updated.data);
setShowAddWard(false);
```

---

## Fix 3: Signup — Detect Existing User & Offer Login Path

**Problem:** `signup.js:39-44` returns hard 400 `"User with this mobile or email already exists"` with no alternative.

### Backend Changes

**3a. Modify `signup.js:39-44`** to return a distinguished response instead of an error:

Replace:
```js
if (existingUser) {
  throw new ValidationError('User with this mobile or email already exists');
}
```

With:
```js
if (existingUser) {
  return { exists: true, message: 'An account with this mobile or email already exists. Please log in or add a new ward from your dashboard.' };
}
```

**3b. Update `auth.js:9-20`** (`signup` controller) to handle `exists: true`:

```js
const result = await signupUser({ ... });
if (result.exists) {
  return res.status(409).json(result);  // 409 Conflict
}
return res.status(201).json(result);
```

**3c. `signup.js` return type changes** — it currently always returns `{ user, token, student }`. After this change, it can also return `{ exists: true, message }`. No other callers depend on this shape.

### Frontend Changes

**3d. Update `Signup.jsx` `handleSubmit` error handling** — detect 409:

```js
catch (err) {
  if (err.response?.status === 409) {
    // Account exists — offer login or "Add Ward" redirect
    setApiError(err.response.data.message);
    // Show a button: "Log In Instead" + "Add Ward to Existing Account"
    setShowExistingAccountOptions(true);
  } else {
    setApiError(err.response?.data?.error || 'Signup failed.');
  }
}
```

**3e. Add redirect buttons** below the error message in `Signup.jsx`:

```jsx
{showExistingAccountOptions && (
  <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
    <button className="btn" onClick={() => onNavigate('login')}>
      Log In Instead
    </button>
    <button className="btn btn-secondary" onClick={...}>  // or navigate to payment to add ward
      Add a New Ward (Child)
    </button>
  </div>
)}
```

---

## Fix 4: Reports Error State (Minor)

**Problem:** `Reports.jsx:10` doesn't destructure `error` from `useDashboardQuery`, so API failures show silent ₹0.

### Changes

**4a. `Reports.jsx:10`** — destructure error:
```js
const { data: report, loading, error } = useDashboardQuery(...);
```

**4b. Add error display** — between loading check (line 125) and the metrics block:
```jsx
{error ? (
  <div className="alert alert-error" style={{ margin: '20px 0' }}>
    Failed to load report data: {error}
  </div>
) : (
  // ... existing metrics content
)}
```

---

## Implementation Order

| Step | File(s) | Description | Risk |
|------|---------|-------------|------|
| 1 | `apps/web/src/api/client.js` | Add 401 interceptor with refresh | Low — only triggers on 401 |
| 2 | `apps/api/src/controllers/auth.js` + `apps/api/src/index.js` | Add `refreshToken` endpoint | Low — isolated new route |
| 3 | `apps/api/src/controllers/auth.js` + `apps/api/src/index.js` | Add `POST /api/guardians/students` | Low — new isolated endpoint |
| 4 | `apps/web/src/pages/guardian/AddWard.jsx` + `Payment.jsx` | Add Ward modal UI | Medium — new UI component |
| 5 | `apps/api/src/domain/auth/signup.js` + `apps/api/src/controllers/auth.js` | Change signup duplicate response to 409 | Medium — return type change |
| 6 | `apps/web/src/pages/auth/Signup.jsx` | Handle 409 with login/add-ward options | Low — error handling branch |
| 7 | `apps/web/src/pages/admin/Reports.jsx` | Add error destructure + display | Low — pure UI fix |

---

## Verification

1. Start both API and web servers
2. Login, wait 24h (or set `expiresIn: '10s'` for testing) → verify interceptor catches 401, refreshes token, retries
3. Create guardian account with 1 child → verify payment page shows 1 ward
4. Click "+ Add Ward" → fill form → verify new child appears in selector
5. Try signing up with same mobile → verify 409 response shows "Log In" and "Add Ward" options
6. Kill API, load reports → verify error message appears (not silent ₹0)
