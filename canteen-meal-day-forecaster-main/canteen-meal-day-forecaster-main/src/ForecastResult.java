import java.time.LocalDate;

public class ForecastResult {
    private final int itemId;
    private final LocalDate targetDate;
    private final int predictedQuantity;
    private final double baseline;
    private final boolean specialEvent;
    private Integer actualQuantity;

    public ForecastResult(int itemId, LocalDate targetDate, int predictedQuantity, double baseline, boolean specialEvent, Integer actualQuantity) {
        this.itemId = itemId;
        this.targetDate = targetDate;
        this.predictedQuantity = predictedQuantity;
        this.baseline = baseline;
        this.specialEvent = specialEvent;
        this.actualQuantity = actualQuantity;
    }

    public int getItemId() {
        return itemId;
    }

    public LocalDate getTargetDate() {
        return targetDate;
    }

    public int getPredictedQuantity() {
        return predictedQuantity;
    }

    public double getBaseline() {
        return baseline;
    }

    public boolean isSpecialEvent() {
        return specialEvent;
    }

    public Integer getActualQuantity() {
        return actualQuantity;
    }

    public void setActualQuantity(Integer actualQuantity) {
        this.actualQuantity = actualQuantity;
    }
}
