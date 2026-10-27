import java.time.LocalDate;

public class SalesRecord {
    private final int itemId;
    private final LocalDate date;
    private final int quantity;
    private final boolean specialEvent;

    public SalesRecord(int itemId, LocalDate date, int quantity, boolean specialEvent) {
        this.itemId = itemId;
        this.date = date;
        this.quantity = quantity;
        this.specialEvent = specialEvent;
    }

    public int getItemId() {
        return itemId;
    }

    public LocalDate getDate() {
        return date;
    }

    public int getQuantity() {
        return quantity;
    }

    public boolean isSpecialEvent() {
        return specialEvent;
    }
}
