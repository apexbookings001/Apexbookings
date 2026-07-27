import os

files = ['en.ts', 'fr.ts', 'de.ts', 'es.ts', 'pt.ts', 'it.ts']
props = {
    'linkCopied': 'Link copied',
    'ticketDownloaded': 'Ticket downloaded',
    'approved': 'Approved',
    'youAreGoing': 'You are going to {event}',
    'sentTo': 'Sent to {email}',
    'presents': 'Presents',
    'customerName': 'Customer Name',
    'ticketNo': 'Ticket No',
    'dateTime': 'Date & Time',
    'venue': 'Venue',
    'benefits': 'Benefits',
    'scanEntry': 'Scan Entry',
    'download': 'Download',
    'share': 'Share',
    'failed': 'Failed',
    'declined': 'Declined',
    'failedDesc': 'Verification failed',
    'reason': 'Reason',
    'uploadNew': 'Upload New',
    'anotherMethod': 'Another Method',
    'returnHome': 'Return Home',
    'book': 'Book {tier}',
    'step': 'Step {step} of {total}',
    'continue': 'Continue',
    'close': 'Close',
    'paymentGuide': 'Payment Guide',
    'defaultInstructions': 'Default Instructions',
    'filesUploaded': 'files uploaded',
    'bankDetails': 'Bank Details',
    'expired': 'Expired',
    'expiredDesc': 'Session expired',
    'bankInstructions': 'Transfer instructions',
    'amountDue': 'Amount Due',
    'bankWarning': 'Warning',
    'verificationNotice': 'Verification Notice',
    'reviewTitle': 'Review Title',
    'almostThere': 'Almost There',
    'verificationDesc': 'Verifying {time}',
    'confirmationEmail': 'Confirmation to {email}',
    'bookAnother': 'Book Another'
}

for f in files:
    path = os.path.join(r'C:\Users\USER\Booking\src\i18n\translations', f)
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Simple replacement: insert before the known string 'closeReturn: 'Close and return to page','
    if "closeReturn: 'Close and return to page'," in content:
        additions = ''
        for k, v in props.items():
            if k + ':' not in content:
                additions += f"    {k}: '{v}',\n"
        content = content.replace("closeReturn: 'Close and return to page',", additions + "    closeReturn: 'Close and return to page',")
        with open(path, 'w', encoding='utf-8') as file:
            file.write(content)
print('Done')
