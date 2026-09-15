import { Invoice } from '@/types/invoice'
import { formatINR } from '@/utils/formulas'
import './invoice-print.css'

interface Props {
  invoice: Invoice
  tenantName: string
  tenantAddress: string
  qrSrc: string | null
  propertyPhotoSrc?: string | null
}

/** On-screen invoice view. KEEP IN SYNC WITH backend/templates/invoice.html
 * -- see the header comment in invoice-print.css. Root and every descendant
 * use only the .inv-* classes above (no Tailwind dark: variants anywhere in
 * this subtree) so it looks like printed paper regardless of the app's own
 * light/dark theme. */
export default function InvoiceDocument({ invoice, tenantName, tenantAddress, qrSrc, propertyPhotoSrc }: Props) {
  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="inv-sheet">
      <div className="inv-banner">
        {propertyPhotoSrc ? (
          <img className="inv-banner-photo" src={propertyPhotoSrc} alt="" />
        ) : (
          <div className="inv-banner-icon">🏠</div>
        )}
        <div>
          <h1>Rent &amp; Utilities Invoice</h1>
          <div className="inv-date">{invoiceDate}</div>
        </div>
      </div>

      <div className="inv-content">
        <div className="inv-section-title">Tenant Information</div>
        <p className="inv-tenant-name">{tenantName}</p>
        <p className="inv-tenant-address">{tenantAddress}</p>

        <div className="inv-section-title">Utility Charges</div>
        <table className="inv-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="inv-num">Start</th>
              <th className="inv-num">End</th>
              <th className="inv-num">Usage</th>
              <th className="inv-num">Rate</th>
              <th className="inv-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="inv-desc">Room Meter (A)</td>
              <td className="inv-num">{invoice.roomStart}</td>
              <td className="inv-num">{invoice.roomEnd}</td>
              <td className="inv-num">{invoice.roomUsage}</td>
              <td className="inv-num">{formatINR(invoice.roomRate)}</td>
              <td className="inv-num">{formatINR(invoice.roomAmount)}</td>
            </tr>
            <tr>
              <td className="inv-desc">Water Meter (B)</td>
              <td className="inv-num">{invoice.waterStart}</td>
              <td className="inv-num">{invoice.waterEnd}</td>
              <td className="inv-num">{invoice.waterUsage}</td>
              <td className="inv-num">{formatINR(invoice.waterRate)}</td>
              <td className="inv-num">{formatINR(invoice.waterAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="inv-section-title">Rent &amp; Dues</div>
        <div className="inv-dues-row">
          <span className="inv-label">Monthly Rent (C)</span>
          <span className="inv-value">{formatINR(invoice.monthlyRent)}</span>
        </div>
        <div className="inv-dues-row">
          <span className="inv-label">Previous Dues (D)</span>
          <span className="inv-value">{formatINR(invoice.previousDues)}</span>
        </div>
        <div className="inv-total-bar">
          <span className="inv-label">Total Payable (A+B+C+D)</span>
          <span className="inv-value">{formatINR(invoice.totalPayable)}</span>
        </div>

        <div className="inv-payment-area">
          <div>
            <div className="inv-upi-label">Pay via UPI</div>
            <div className="inv-upi-id">{invoice.upiId || 'Contact landlord for UPI ID'}</div>
          </div>
          {qrSrc ? (
            <img className="inv-qr" src={qrSrc} alt="UPI payment QR code" />
          ) : (
            <div className="inv-qr-placeholder">QR loading…</div>
          )}
        </div>

        <div className="inv-notes">
          Payment is due within {invoice.dueDays} day{invoice.dueDays !== 1 ? 's' : ''} of the invoice date.
          {invoice.waterDivisor > 1 && (
            <> Water usage on this invoice was divided by {invoice.waterDivisor} (shared meter).</>
          )}
        </div>
      </div>
    </div>
  )
}
