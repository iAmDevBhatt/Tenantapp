Build a web app called "Rent Ledger" that replaces a landlord's Google Sheet workflow for generating monthly rent & utilities invoices for tenants.

CONTEXT
The landlord currently maintains one Google Sheet per invoice and manually exports it to PDF. They have multiple tenants across one or more properties; tenants move in and out over time. They want a real web app (not a spreadsheet) that remembers tenants and past invoices, generates a PDF matching their existing invoice design, and will be self-hosted (Docker) with data that must survive container rebuilds/redeploys.

CORE FEATURES

1. Tenant management
   - Add/edit tenants: name, property address, monthly rent, room-meter rate (₹/unit), water-meter rate (₹/unit), a "water meter shared by N tenants" setting (usage is divided by N before billing — default N=1), UPI ID for payment, move-in date.
   - Optional extended profile fields per tenant: permanent address (textarea) and emergency/guardian contact name + phone. Displayed in the profile tab when populated.
   - Mark a tenant "moved out" (soft-delete / inactive) instead of deleting them, so their invoice history is preserved. Inactive tenants can be reactivated. New tenants can be added any time.
   - Per-tenant documents: ability to upload and store files against a tenant record (lease agreement, rental agreement, ID proof, move-in photos, etc.) — list, download, delete. Stored durably (see PERSISTENCE below), not just referenced by a broken local path. Per-document visibility flag: landlord decides which documents are shared with the tenant in their portal (default hidden).
   - Per-tenant passport-size profile photo (DP): upload/replace/delete a circular avatar photo. Displayed on the dashboard tenant cards and the tenant detail page header.
   - Download all documents (zip): one-click download of all a tenant's uploaded documents plus their profile photo as a single zip file.

2. Properties & Flats
   - Manage multiple properties, each with named flats/units (e.g. "2 BHK", "Shop 1").
   - When adding or editing a tenant, pick a Property → Flat from dropdowns to auto-fill the `propertyAddress` field. The address is still freely editable. Flat association is stored on the tenant record (`flat_id` FK).
   - Full CRUD in Settings: add/edit/delete properties and their flats. Deleting a property cascades to its flats.

3. New invoice
   - Pick an active tenant. Enter this month's meter end-readings for a Room meter and a Water meter.
   - Start readings auto-fill from that tenant's last invoice's end readings (so the landlord only ever types the new end reading).
   - "Previous dues" auto-fills from the outstanding balance of the tenant's most recent unpaid invoice (`net_payable − amount_paid`), else 0. Editable.
   - A new invoice cannot be created unless the previous invoice has a payment record (full payment, partial amount, or at least one write-off). Enforced server-side (422) and surfaced as a warning banner + disabled save button in the UI.
   - Live-computed preview using these exact formulas:
     roomUsage = roomEnd - roomStart
     roomAmount = roomUsage * roomRate
     waterUsageRaw = waterEnd - waterStart
     waterUsage = waterUsageRaw / waterDivisor   (divisor = shared-by count, default 1)
     waterAmount = waterUsage * waterRate
     totalPayable = roomAmount + waterAmount + monthlyRent + previousDues
   - Save the invoice (persisted, immutable snapshot of all the numbers used).

4. Invoice history
   - Per tenant, list every past invoice (date, total, paid/unpaid status).
   - Toggle an invoice paid/unpaid (this drives the next invoice's auto-filled previous dues).
   - Record a partial payment amount on an unpaid invoice; the outstanding balance carries forward to the next invoice's previous dues.
   - Re-open and re-download the PDF of ANY past invoice at any time, not just the most recent one — the styled document is regenerated from the saved invoice snapshot, so old invoices always render correctly even if the tenant's current rates changed since.
   - Delete an invoice if it was entered by mistake.

5. Invoice write-offs
   - Write off part or all of an outstanding (unpaid) invoice with a required reason/comment.
   - `total_payable` is never changed (the invoice is an immutable snapshot). Write-offs are stored in a child table (`invoice_writeoffs`).
   - Net payable = `total_payable − Σ write_offs`. Displayed separately; "Write-off applied" badge shown when net < total.
   - Each write-off is audited (amount, reason, author, timestamp) and can be undone individually.
   - The WhatsApp message and previous-dues auto-fill for the next invoice both use net payable (not gross total).
   - Write-offs can only be added to unpaid invoices (enforced server-side and client-side).
   - Amount validation: `0 < amount <= netPayable` (enforced both client-side and server-side, HTTP 422).

6. Invoice document (must visually match the reference design — see layout below), with:
   - A "Download PDF" button that exports exactly what's on screen.
   - A "Send via WhatsApp" button: builds a `wa.me/<tenant phone number>?text=<prefilled message>` link and opens it in a new tab/WhatsApp app. Message uses net payable when write-offs exist. Since WhatsApp click-to-chat links can't attach files automatically, the flow is: download the PDF, then tap Send via WhatsApp, then attach it in the opened chat.
   - Meter reading photos: upload up to 3 photos per invoice (e.g. photos of meter displays). Thumbnails shown on the invoice detail page; photos embedded at the bottom of the PDF. Stored under `UPLOADS_DIR` like all other tenant documents.

INVOICE LAYOUT TO MATCH (reference: a blue-and-white printable receipt)
- Header banner (deep blue background, white text): small building photo/icon, title "Rent & Utilities Invoice", and the invoice date.
- "Tenant Information" section: Tenant Name, Property Address (multi-line).
- "Utility Charges" section: a table with columns Description | Opening Reading | Closing Reading | Usage | Rate | Amount, one row for "Room Meter (A)" and one for "Water Meter (B)". Meter readings and usage are whole numbers (no decimal places).
- "Rent & Dues" section: Monthly Rent (C), Previous Dues (D), then a highlighted total bar "Total Payable (A+B+C+D)" = the total.
- Payment area: UPI ID text, plus a QR code. Generate the QR dynamically per invoice from a UPI deep link (`upi://pay?pa=<upiId>&pn=<owner name>&am=<total>&cu=INR`) so the amount is pre-filled when the tenant scans it — don't just use a static image.
- A small notes footer, e.g. payment due within N days of the invoice, and (if water is shared) a note that usage was divided by the shared-by count.
- Optional "Meter Reading Photos" section at the bottom (shown only when photos are attached).
- The invoice/document view should look like a printed paper (white background, blue accents) regardless of the app's own light/dark theme.

DATA MODEL (suggested)
- tenants: { id, name, phone, propertyAddress, monthlyRent, roomRate, waterRate, waterDivisor, upiId, active, moveInDate, moveOutDate, profilePhotoPath, flatId, permanentAddress, emergencyContactName, emergencyContactPhone }
- tenant_documents: { id, tenantId, filename, fileUrl/path, uploadedAt, docType (lease/id_proof/photo/meter_reading/other), invoiceId (nullable FK → invoices, set for meter_reading docs) }
- invoices: { id, tenantId, invoiceDate, roomStart, roomEnd, waterStart, waterEnd, roomRate, waterRate, waterDivisor, monthlyRent, previousDues, roomAmount, waterAmount, totalPayable, paid, paidDate, createdAt }
- invoice_writeoffs: { id, invoiceId, amount, reason, writtenOffBy, writtenOffAt }
- meter_submissions: { id, tenantId, photoPath, photoType (flat_meter|water_meter|property|other), originalFilename, contentType, sizeBytes, submittedAt, status (pending|approved|applied|rejected), appliedToInvoiceId, notes } — staging table for tenant-uploaded meter reading photos. Status flow: pending → approved → applied (when tagged to an invoice) or pending → rejected. When a submission is tagged to an invoice, a TenantDocument row (doc_type="meter_reading") is also created via save_meter_submission_as_document().
- properties: { id, name, address, createdAt }
- property_flats: { id, propertyId, label, createdAt }
- settings: { ownerName, defaultUpiId, propertyPhotoUrl } — owner-level info used as the UPI payee name and prefilled on new tenants.

PERSISTENCE / DEPLOYMENT
- Ship as a Docker image (with a docker-compose.yml for local/self-hosting). All state — the database and every uploaded file (tenant documents, profile photos, property photo, meter-reading photos) — must live under one or more named Docker volumes, so `docker compose down` / image rebuilds / redeploys never lose data.
- Take a stance on the storage engine and file storage location and document it clearly in a README (e.g., a single SQLite file + an uploads/ folder, both under /data, both on a mounted volume — or a database container + a files volume, whichever the implementation picks) so it's obvious what to back up.
- Include a simple backup note/script (e.g., "tar up the /data volume") since this is the landlord's only source of invoice history.

UI STRING EXTERNALISATION
- All user-visible strings must be stored in `frontend/public/labels.properties` (Java `.properties` format, `key=value`).
- The frontend loads this file once via a `useLabels()` hook (`frontend/src/hooks/useLabels.ts`); components call `l('key', 'fallback')` — never inline string literals.
- When adding new features, append new keys to `labels.properties` first, then use `l('key', 'fallback')` in components. Never hardcode user-visible text in JSX or TypeScript directly.

BUILT (previously roadmap)
- Tenant meter-reading submission: tenants upload photos (flat meter, water meter, whole property) via the portal. Landlord reviews and approves/rejects from TenantDetailPage. Approved photos appear in the New Invoice form as a picker; selecting them tags them to the invoice (status becomes "applied") and they no longer appear for future invoices. Tagged photos visible to tenant in their invoice view. Rate-limited portal upload (20/minute); image-only MIME validation; 20 MB cap.

NON-FUNCTIONAL
- Should work well on a phone (this will mostly be used from a phone).
- Verify the formulas against this known-correct sample: Room 2135→2236 @ ₹6.65/unit = ₹671.65; Water 837→870 @ ₹6.65/unit (divisor 1) = ₹219.45; Rent ₹8000; Previous dues ₹0 → Total = ₹8891.10.
- Build it with clean, considered visual design (a real color palette and type hierarchy, not default Bootstrap-looking UI) — the landlord will be looking at this and sending it to tenants monthly.
