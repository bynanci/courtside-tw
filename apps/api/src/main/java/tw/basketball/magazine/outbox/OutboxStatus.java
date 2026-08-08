package tw.basketball.magazine.outbox;

public enum OutboxStatus {
    PENDING,
    CLAIMED,
    COMPLETED,
    FAILED,
    DEAD_LETTER
}
