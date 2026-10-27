import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class CanteenService {
    private final List<MenuItem> menuItems = new ArrayList<>();
    private final List<SalesRecord> salesRecords = new ArrayList<>();
    private final List<ForecastResult> forecasts = new ArrayList<>();
    private int nextItemId = 1;

    private final Path dataDirectory = Path.of("data");
    private final Path itemsFile = dataDirectory.resolve("menu-items.csv");
    private final Path salesFile = dataDirectory.resolve("sales.csv");
    private final Path forecastsFile = dataDirectory.resolve("forecasts.csv");

    public MenuItem addMenuItem(String name) {
        MenuItem item = new MenuItem(nextItemId++, name.trim());
        menuItems.add(item);
        return item;
    }

    public void addSalesRecord(SalesRecord record) {
        salesRecords.add(record);
        salesRecords.sort(Comparator.comparing(SalesRecord::getDate));
    }

    public void saveDailySales(SalesRecord record) {
        salesRecords.removeIf(existing -> existing.getItemId() == record.getItemId()
                && existing.getDate().equals(record.getDate()));
        addSalesRecord(record);
    }

    public boolean deleteMenuItem(int id) {
        boolean removed = menuItems.removeIf(item -> item.getId() == id);
        if (removed) {
            salesRecords.removeIf(record -> record.getItemId() == id);
            forecasts.removeIf(forecast -> forecast.getItemId() == id);
        }
        return removed;
    }

    public boolean setActualQuantity(int itemId, LocalDate targetDate, int quantity) {
        boolean found = false;
        for (ForecastResult forecast : forecasts) {
            if (forecast.getItemId() == itemId && forecast.getTargetDate().equals(targetDate)) {
                forecast.setActualQuantity(quantity);
                found = true;
            }
        }
        return found;
    }

    public void addForecast(ForecastResult forecast) {
        forecasts.removeIf(existing -> existing.getItemId() == forecast.getItemId()
                && existing.getTargetDate().equals(forecast.getTargetDate()));
        forecasts.add(forecast);
    }

    public List<MenuItem> getMenuItems() {
        return new ArrayList<>(menuItems);
    }

    public List<SalesRecord> getSalesRecords() {
        return new ArrayList<>(salesRecords);
    }

    public List<ForecastResult> getForecasts() {
        return new ArrayList<>(forecasts);
    }

    public List<ForecastResult> getForecastsWithoutActuals() {
        List<ForecastResult> pending = new ArrayList<>();
        for (ForecastResult f : forecasts) {
            if (f.getActualQuantity() == null) pending.add(f);
        }
        return pending;
    }

    public MenuItem findItemById(int id) {
        for (MenuItem item : menuItems) {
            if (item.getId() == id) return item;
        }
        return null;
    }

    public MenuItem findItemByName(String name) {
        for (MenuItem item : menuItems) {
            if (item.getName().equalsIgnoreCase(name.trim())) return item;
        }
        return null;
    }

    public ForecastResult createForecast(MenuItem item, LocalDate targetDate,
                                         int window, boolean specialEvent) {
        List<SalesRecord> matching = new ArrayList<>();
        for (SalesRecord record : salesRecords) {
            if (record.getItemId() == item.getId() && record.getDate().isBefore(targetDate)) {
                matching.add(record);
            }
        }
        matching.sort(Comparator.comparing(SalesRecord::getDate).reversed());

        if (matching.isEmpty()) return null;

        int count = Math.min(window, matching.size());
        double sum = 0;
        for (int i = 0; i < count; i++) sum += matching.get(i).getQuantity();
        double baseline = sum / count;

        // Simple, clearly documented example adjustment: +10% for an event.
        // This is an assumption for the prototype, not a learned or proven effect.
        double adjusted = specialEvent ? baseline * 1.10 : baseline;
        int predicted = (int) Math.round(adjusted);

        return new ForecastResult(item.getId(), targetDate, predicted, baseline, specialEvent, null);
    }

    public void saveData() {
        try {
            persist();
        } catch (IOException ex) {
            System.out.println("Warning: could not save data: " + ex.getMessage());
        }
    }

    public void persist() throws IOException {
        Files.createDirectories(dataDirectory);

        try (BufferedWriter writer = Files.newBufferedWriter(itemsFile)) {
            for (MenuItem item : menuItems) {
                writer.write(item.getId() + "," + escape(item.getName()));
                writer.newLine();
            }
        }

        try (BufferedWriter writer = Files.newBufferedWriter(salesFile)) {
            for (SalesRecord record : salesRecords) {
                writer.write(record.getItemId() + "," + record.getDate() + ","
                        + record.getQuantity() + "," + record.isSpecialEvent());
                writer.newLine();
            }
        }

        try (BufferedWriter writer = Files.newBufferedWriter(forecastsFile)) {
            for (ForecastResult f : forecasts) {
                String actual = f.getActualQuantity() == null ? "" : f.getActualQuantity().toString();
                writer.write(f.getItemId() + "," + f.getTargetDate() + ","
                        + f.getPredictedQuantity() + "," + f.getBaseline() + ","
                        + f.isSpecialEvent() + "," + actual);
                writer.newLine();
            }
        }
    }

    public void loadData() {
        try {
            Files.createDirectories(dataDirectory);
            if (Files.exists(itemsFile)) {
                try (BufferedReader reader = Files.newBufferedReader(itemsFile)) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String[] p = line.split(",", 2);
                        if (p.length == 2) {
                            int id = Integer.parseInt(p[0]);
                            menuItems.add(new MenuItem(id, unescape(p[1])));
                            nextItemId = Math.max(nextItemId, id + 1);
                        }
                    }
                }
            }

            if (Files.exists(salesFile)) {
                try (BufferedReader reader = Files.newBufferedReader(salesFile)) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String[] p = line.split(",", -1);
                        if (p.length == 4) {
                            salesRecords.add(new SalesRecord(Integer.parseInt(p[0]),
                                    LocalDate.parse(p[1]), Integer.parseInt(p[2]),
                                    Boolean.parseBoolean(p[3])));
                        }
                    }
                }
            }

            if (Files.exists(forecastsFile)) {
                try (BufferedReader reader = Files.newBufferedReader(forecastsFile)) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String[] p = line.split(",", -1);
                        if (p.length == 6) {
                            Integer actual = p[5].isBlank() ? null : Integer.parseInt(p[5]);
                            forecasts.add(new ForecastResult(Integer.parseInt(p[0]),
                                    LocalDate.parse(p[1]), Integer.parseInt(p[2]),
                                    Double.parseDouble(p[3]), Boolean.parseBoolean(p[4]), actual));
                        }
                    }
                }
            }
        } catch (IOException | RuntimeException ex) {
            System.out.println("Warning: some saved data could not be loaded: " + ex.getMessage());
        }
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace(",", "\\,");
    }

    private String unescape(String value) {
        return value.replace("\\,", ",").replace("\\\\", "\\");
    }
}
