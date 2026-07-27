const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const replacements = [
  ['tr.booking.linkCopied', 'tr.toast.linkCopied'],
  ['tr.booking.ticketDownloaded', 'tr.toast.downloaded'],
  ['tr.booking.approved', 'tr.done.eyebrow'],
  ['tr.booking.youAreGoing', 'tr.done.heading'],
  ['tr.booking.sentTo', 'tr.done.subtitle'],
  ['tr.booking.presents', 'tr.done.presents'],
  ['tr.booking.customerName', 'tr.done.customerName'],
  ['tr.booking.ticketNo', 'tr.done.ticketNo'],
  ['tr.booking.dateTime', 'tr.done.dateTime'],
  ['tr.booking.venue', 'tr.done.venue'],
  ['tr.booking.benefits', 'tr.done.includedBenefits'],
  ['tr.booking.scanEntry', 'tr.done.scanEntry'],
  ['tr.booking.download', 'tr.done.downloadTicket'],
  ['tr.booking.share', 'tr.done.shareTicket'],
  ['tr.booking.failed', 'tr.declined.eyebrow'],
  ['tr.booking.declined', 'tr.declined.heading'],
  ['tr.booking.failedDesc', 'tr.declined.subheading'],
  ['tr.booking.reason', 'tr.declined.reason'],
  ['tr.booking.uploadNew', 'tr.declined.uploadNew'],
  ['tr.booking.anotherMethod', 'tr.declined.chooseAnother'],
  ['tr.booking.returnHome', 'tr.booking.closeReturn'],
  ['tr.booking.book', 'tr.tickets.bookNow'],
  ['tr.booking.step', 'tr.booking.stepOf'],
  ['tr.booking.continue', 'tr.common.continue'],
  ['tr.booking.close', 'tr.common.close']
];

for (const [oldKey, newKey] of replacements) {
    content = content.replaceAll(oldKey, newKey);
}

// Additional manual fixes for string interpolation in App.tsx
content = content.replace("tr.tickets.bookNow.replace('{tier}', tier.name)", "`${tr.tickets.bookNow} ${tier.name}`");

// Missing keys from BookingModal that I used:
content = content.replace("tr.booking.paymentGuide", "tr.booking.paymentInstructions");
content = content.replace("tr.booking.defaultInstructions", "(payments.methods.apple_gift_card?.instructions || 'Follow the specific instructions for this payment method.')");
content = content.replace("tr.booking.filesUploaded", "'file(s) uploaded'");
content = content.replace("tr.booking.bankDetails", "'Bank Transfer Details'");
content = content.replace("tr.booking.expired", "'Transfer window expired'");
content = content.replace("tr.booking.expiredDesc", "'This session has been cancelled.'");
content = content.replace("tr.booking.bankInstructions", "'Transfer to the account below.'");
content = content.replace("tr.booking.amountDue", "'Amount Due'");
content = content.replace("tr.booking.bankWarning", "'Complete the transfer within the time window.'");
content = content.replace("tr.booking.verificationNotice", "'After uploading your proof, our team reviews it within 10–20 minutes.'");
content = content.replace("tr.booking.reviewTitle", "tr.waiting.heading");
content = content.replace("tr.booking.almostThere", "tr.waiting.subheading");
content = content.replace("tr.booking.verificationDesc", "tr.waiting.waitMessage");
content = content.replace("tr.booking.confirmationEmail", "tr.waiting.waitMessage");
content = content.replace("tr.booking.bookAnother", "'Book Another Ticket'");

fs.writeFileSync('src/App.tsx', content, 'utf-8');
console.log('App.tsx fixed');
