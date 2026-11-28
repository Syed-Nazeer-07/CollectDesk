# Security policy

CollectDesk is a fictional-data technical-evaluation application. It is not authorized to store actual customer invoices, debtor data, payment information or sensitive documents.

## Supported revision

Security fixes and evaluation apply to the current default branch, `main`. Historical branches and development tags are not supported releases.

## Report a vulnerability

If private vulnerability reporting is available in the repository's [Security tab](https://github.com/Syed-Nazeer-07/CollectDesk/security), use it. Otherwise contact the repository maintainer privately through an existing contact channel. Do not post secrets, personally identifying information, exploit payloads or detailed vulnerabilities in public issues.

Include the affected commit, a minimal reproduction using fictional records, expected and actual behavior, and the potential impact. Do not access other users' records or test destructive actions against the hosted demo.

## Local configuration

Keep database credentials, session signing secrets and email provider keys outside Git. Use separate disposable databases for tests and seed operations. Enable optional identity and evidence features only after configuring appropriate test services. Do not reuse local fixture credentials in production.

The role, tenant and transaction tests are regression checks, not a security certification. Independent review and documented operational safeguards are required before any real-data use.
