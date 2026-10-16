# ATTEND destination-side duplicate protection

The Google Sheets adapter reads the configured ATTEND Events table before each
append. Column E is the `dedupeKey`. If any existing row has that exact key, the
adapter returns success without appending; the outbox delivery boundary commits
the event as sent. Existing duplicate rows are left intact, not deleted.

The check and append run while the existing PostgreSQL append advisory lock is
held, alongside the lease-token ownership check and sent-state transaction.
Competing workers sharing the same database cannot interleave these operations.
After an append succeeds but its response or the database commit is lost, a later
retry sees the key in Sheets and finishes without another append.

A failed authorization, lookup, or malformed lookup response must not be treated
as an empty sheet. Lookup failure fails delivery and uses the existing bounded
retry/alert behavior. Credentials, retry limits, and trigger behavior are
unchanged. A successful lookup of an existing row needs no append permission.

This is not a distributed transaction with Google Sheets. Unrelated writers or
different databases targeting the same sheet do not share this database lock;
they must coordinate separately. Keep the seven-column A:G event layout and
an unbounded table range so all historical keys are visible to the lookup.

Tests use a synthetic in-memory Sheets API adapter: normal append; external
append followed by a lost response and safe retry; already duplicated sheet
rows; and authorization failure during lookup without an append. No live Sheet
rows are created by these tests.

No Production replay or credential reconnection is part of this Development
change. Staff must reconnect authorization and authorize replay after publishing.
