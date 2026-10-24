-- clock_timestamp() makes future-date validation intentionally volatile.
alter function private.finance_time(text) volatile;
