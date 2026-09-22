import { Invoice } from '@/types/invoice'
import { formatINR } from '@/utils/formulas'
import { useLabels } from '@/hooks/useLabels'
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
  const { l } = useLabels()

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
          <h1>{l('invoice.title', 'Rent & Utilities Invoice')}</h1>
          <div className="inv-date">{invoiceDate}</div>
        </div>
      </div>

      <div className="inv-content">
        <div className="inv-section-title">{l('invoice.section.tenantInfo', 'Tenant Information')}</div>
        <p className="inv-tenant-name">{tenantName}</p>
        <p className="inv-tenant-address">{tenantAddress}</p>

        <div className="inv-section-title">{l('invoice.section.utilityCharges', 'Utility Charges')}</div>
        <table className="inv-table">
          <thead>
            <tr>
              <th>{l('invoice.table.header.description', 'Description')}</th>
              <th className="inv-num">{l('invoice.table.header.start', 'Opening Reading')}</th>
              <th className="inv-num">{l('invoice.table.header.end', 'Closing Reading')}</th>
              <th className="inv-num">{l('invoice.table.header.usage', 'Usage')}</th>
              <th className="inv-num">{l('invoice.table.header.rate', 'Rate')}</th>
              <th className="inv-num">{l('invoice.table.header.amount', 'Amount')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="inv-desc" data-label={l('invoice.table.header.description', 'Description')}>{l('invoice.row.roomMeter', 'Room Meter (A)')}</td>
              <td className="inv-num" data-label={l('invoice.table.header.start', 'Opening Reading')}>{Math.floor(parseFloat(invoice.roomStart))}</td>
              <td className="inv-num" data-label={l('invoice.table.header.end', 'Closing Reading')}>{Math.floor(parseFloat(invoice.roomEnd))}</td>
              <td className="inv-num" data-label={l('invoice.table.header.usage', 'Usage')}>{Math.floor(parseFloat(invoice.roomUsage))}</td>
              <td className="inv-num" data-label={l('invoice.table.header.rate', 'Rate')}>{formatINR(invoice.roomRate)}</td>
              <td className="inv-num" data-label={l('invoice.table.header.amount', 'Amount')}>{formatINR(invoice.roomAmount)}</td>
            </tr>
            <tr>
              <td className="inv-desc" data-label={l('invoice.table.header.description', 'Description')}>{l('invoice.row.waterMeter', 'Water Meter (B)')}</td>
              <td className="inv-num" data-label={l('invoice.table.header.start', 'Opening Reading')}>{Math.floor(parseFloat(invoice.waterStart))}</td>
              <td className="inv-num" data-label={l('invoice.table.header.end', 'Closing Reading')}>{Math.floor(parseFloat(invoice.waterEnd))}</td>
              <td className="inv-num" data-label={l('invoice.table.header.usage', 'Usage')}>{Math.floor(parseFloat(invoice.waterUsage))}</td>
              <td className="inv-num" data-label={l('invoice.table.header.rate', 'Rate')}>{formatINR(invoice.waterRate)}</td>
              <td className="inv-num" data-label={l('invoice.table.header.amount', 'Amount')}>{formatINR(invoice.waterAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="inv-section-title">{l('invoice.section.rentAndDues', 'Rent & Dues')}</div>
        <div className="inv-dues-row">
          <span className="inv-label">{l('invoice.label.monthlyRent', 'Monthly Rent (C)')}</span>
          <span className="inv-value">{formatINR(invoice.monthlyRent)}</span>
        </div>
        <div className="inv-dues-row">
          <span className="inv-label">{l('invoice.label.previousDues', 'Previous Dues (D)')}</span>
          <span className="inv-value">{formatINR(invoice.previousDues)}</span>
        </div>
        <div className="inv-total-bar">
          <span className="inv-label">{l('invoice.label.totalPayable', 'Total Payable (A+B+C+D)')}</span>
          <span className="inv-value">{formatINR(invoice.totalPayable)}</span>
        </div>

        <div className="inv-payment-area">
          <div>
            <div className="inv-upi-label">{l('invoice.label.payViaUpi', 'Pay via UPI')}</div>
            <div className="inv-upi-id">{invoice.upiId || l('invoice.label.contactLandlord', 'Contact landlord for UPI ID')}</div>
          </div>
          {qrSrc ? (
            <img className="inv-qr" src={qrSrc} alt={l('invoice.qr.altText', 'UPI payment QR code')} />
          ) : (
            <div className="inv-qr-placeholder">{l('invoice.qr.loading', 'QR loading…')}</div>
          )}
        </div>

        <div className="inv-notes">
          {l('invoice.notes.dueDate', 'Payment is due within {dueDays} day(s) of the invoice date.')
            .replace('{dueDays}', String(invoice.dueDays))}
          {invoice.waterDivisor > 1 && (
            <> {l('invoice.notes.sharedMeter', 'Water usage on this invoice was divided by {waterDivisor} (shared meter).')
              .replace('{waterDivisor}', String(invoice.waterDivisor))}</>
          )}
        </div>
      </div>
    </div>
  )
}
