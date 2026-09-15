Build a web app called "Rent Ledger" that replaces a landlord's Google Sheet workflow for generating monthly rent & utilities invoices for tenants.

CONTEXT
The landlord currently maintains one Google Sheet per invoice and manually exports it to PDF. They have multiple tenants across one or more properties; tenants move in and out over time. They want a real web app (not a spreadsheet) that remembers tenants and past invoices, generates a PDF matching their existing invoice design, and will be self-hosted (Docker) with data that must survive container rebuilds/redeploys.

CORE FEATURES

1. Tenant management
   - Add/edit tenants: name, property address, monthly rent, room-meter rate (₹/unit), water-meter rate (₹/unit), a "water meter shared by N tenants" setting (usage is divided by N before billing — default N=1), UPI ID for payment, move-in date.
   - Mark a tenant "moved out" (soft-delete / inactive) instead of deleting them, so their invoice history is preserved. Inactive tenants can be reactivated. New tenants can be added any time.
   - Per-tenant documents: ability to upload and store files against a tenant record (lease agreement, ID proof, move-in photos, etc.) — list, download, delete. Stored durably (see PERSISTENCE below), not just referenced by a broken local path.

2. New invoice
   - Pick an active tenant. Enter this month's meter end-readings for a Room meter and a Water meter.
   - Start readings auto-fill from that tenant's last invoice's end readings (so the landlord only ever types the new end reading).
   - "Previous dues" auto-fills from the tenant's most recent invoice's total if that invoice is unpaid, else 0. Editable.
   - Live-computed preview using these exact formulas:
     roomUsage = roomEnd - roomStart
     roomAmount = roomUsage * roomRate
     waterUsageRaw = waterEnd - waterStart
     waterUsage = waterUsageRaw / waterDivisor   (divisor = shared-by count, default 1)
     waterAmount = waterUsage * waterRate
     totalPayable = roomAmount + waterAmount + monthlyRent + previousDues
   - Save the invoice (persisted, immutable snapshot of all the numbers used).

3. Invoice history
   - Per tenant, list every past invoice (date, total, paid/unpaid status).
   - Toggle an invoice paid/unpaid (this drives the next invoice's auto-filled previous dues).
   - Re-open and re-download the PDF of ANY past invoice at any time, not just the most recent one — the styled document is regenerated from the saved invoice snapshot, so old invoices always render correctly even if the tenant's current rates changed since.
   - Delete an invoice if it was entered by mistake.

4. Invoice document (must visually match the reference design — see layout below), with:
   - A "Download PDF" button that exports exactly what's on screen.
   - A "Send via WhatsApp" button: builds a `wa.me/<tenant phone number>?text=<prefilled message>` link (e.g. "Hi <name>, your rent invoice for <month> is ₹<total>, due by <date>.") and opens it in a new tab/WhatsApp app. Since WhatsApp's click-to-chat links can't attach files automatically, the flow is: download the PDF, then tap Send via WhatsApp, then attach the just-downloaded PDF in the opened chat. Add the tenant's phone number as a field on the tenant record to support this.

INVOICE LAYOUT TO MATCH (reference: a blue-and-white printable receipt)
- Header banner (deep blue background, white text): small building photo/icon, title "Rent & Utilities Invoice", and the invoice date.
- "Tenant Information" section: Tenant Name, Property Address (multi-line).
- "Utility Charges" section: a table with columns Description | Start | End | Usage | Rate | Amount, one row for "Room Meter (A)" and one for "Water Meter (B)".
- "Rent & Dues" section: Monthly Rent (C), Previous Dues (D), then a highlighted total bar "Total Payable (A+B+C+D)" = the total.
- Payment area: UPI ID text, plus a QR code. Generate the QR dynamically per invoice from a UPI deep link (`upi://pay?pa=<upiId>&pn=<owner name>&am=<total>&cu=INR`) so the amount is pre-filled when the tenant scans it — don't just use a static image.
- A small notes footer, e.g. payment due within N days of the invoice, and (if water is shared) a note that usage was divided by the shared-by count.
- The invoice/document view should look like a printed paper (white background, blue accents) regardless of the app's own light/dark theme.

DATA MODEL (suggested)
- tenants: { id, name, phone, propertyAddress, monthlyRent, roomRate, waterRate, waterDivisor, upiId, active, moveInDate, moveOutDate }
- tenant_documents: { id, tenantId, filename, fileUrl/path, uploadedAt, type (lease/id_proof/photo/other) }
- invoices: { id, tenantId, invoiceDate, roomStart, roomEnd, waterStart, waterEnd, roomRate, waterRate, waterDivisor, monthlyRent, previousDues, roomAmount, waterAmount, totalPayable, paid, paidDate, createdAt }
- meter_submissions: { id, tenantId, photoUrl, submittedAt, status (pending/applied/rejected), appliedToInvoiceId } — see ROADMAP below; include this table now even though the feature ships later, so the schema doesn't need a breaking migration.
- settings: { ownerName, defaultUpiId, propertyPhotoUrl } — owner-level info used as the UPI payee name and prefilled on new tenants.

PERSISTENCE / DEPLOYMENT
- Ship as a Docker image (with a docker-compose.yml for local/self-hosting). All state — the database and every uploaded file (tenant documents, property photo, meter-reading photos) — must live under one or more named Docker volumes, so `docker compose down` / image rebuilds / redeploys never lose data.
- Take a stance on the storage engine and file storage location and document it clearly in a README (e.g., a single SQLite file + an uploads/ folder, both under /data, both on a mounted volume — or a database container + a files volume, whichever the implementation picks) so it's obvious what to back up.
- Include a simple backup note/script (e.g., "tar up the /data volume") since this is the landlord's only source of invoice history.

ROADMAP (design for, don't build yet)
- Tenant meter-reading submission: eventually, tenants get a link/portal to upload a photo of their meter reading each month; the landlord reviews the photo and applies the reading to that tenant's next invoice instead of retyping it manually. The `meter_submissions` table above and a tenant-facing upload page (even a bare-bones one) are the extension points — call this out as a stretch goal or Phase 2, not required for v1.

NON-FUNCTIONAL
- Should work well on a phone (this will mostly be used from a phone).
- Verify the formulas against this known-correct sample: Room 2135→2236 @ ₹6.65/unit = ₹671.65; Water 837→870 @ ₹6.65/unit (divisor 1) = ₹219.45; Rent ₹8000; Previous dues ₹0 → Total = ₹8891.10.
- Build it with clean, considered visual design (a real color palette and type hierarchy, not default Bootstrap-looking UI) — the landlord will be looking at this and sending it to tenants monthly.