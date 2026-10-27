import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Scanner;

public class Main {
    private static final Scanner scanner = new Scanner(System.in);
    private static final CanteenService service = new CanteenService();

    public static void main(String[] args) {
        service.loadData();
        System.out.println("==========================================");
        System.out.println("     CANTEEN MEAL DEMAND FORECASTER");
        System.out.println("==========================================");

        boolean running = true;
        while (running) {
            showMenu();
            int choice = readInt("Choose an option: ");
            switch (choice) {
                case 1 -> addMenuItem();
                case 2 -> viewMenuItems();
                case 3 -> enterPastSales();
                case 4 -> viewSalesHistory();
                case 5 -> createForecast();
                case 6 -> enterActualSales();
                case 7 -> viewForecastReports();
                case 8 -> {
                    service.saveData();
                    System.out.println("Data saved. Goodbye!");
                    running = false;
                }
                default -> System.out.println("Please choose an option from 1 to 8.");
            }
        }
        scanner.close();
    }

    private static void showMenu() {
        System.out.println("\n--------------- MAIN MENU ---------------");
        System.out.println("1. Add menu item");
        System.out.println("2. View menu items");
        System.out.println("3. Enter past sales");
        System.out.println("4. View sales history");
        System.out.println("5. Forecast demand");
        System.out.println("6. Enter actual sales");
        System.out.println("7. View forecast accuracy reports");
        System.out.println("8. Save and exit");
        System.out.println("-----------------------------------------");
    }

    private static void addMenuItem() {
        String name = readNonEmpty("Enter menu item name: ");
        if (service.findItemByName(name) != null) {
            System.out.println("An item with that name already exists.");
            return;
        }
        MenuItem item = service.addMenuItem(name);
        service.saveData();
        System.out.println("Added item: " + item.getName() + " (ID " + item.getId() + ")");
    }

    private static void viewMenuItems() {
        List<MenuItem> items = service.getMenuItems();
        if (items.isEmpty()) {
            System.out.println("No menu items yet. Add an item first.");
            return;
        }
        System.out.println("\nID   MENU ITEM");
        System.out.println("------------------------------");
        for (MenuItem item : items) {
            System.out.printf("%-4d %s%n", item.getId(), item.getName());
        }
    }

    private static void enterPastSales() {
        MenuItem item = chooseItem();
        if (item == null) return;

        LocalDate date = readDate("Enter sale date (YYYY-MM-DD): ");
        int quantity = readNonNegativeInt("Enter quantity sold: ");
        String weekday = date.getDayOfWeek().toString();
        boolean specialEvent = readYesNo("Was there a special event? (y/n): ");

        service.addSalesRecord(new SalesRecord(item.getId(), date, quantity, specialEvent));
        service.saveData();
        System.out.println("Sales record saved for " + item.getName() + " on " + date
                + " (" + weekday + ").");
    }

    private static void viewSalesHistory() {
        List<SalesRecord> records = service.getSalesRecords();
        if (records.isEmpty()) {
            System.out.println("No sales records yet.");
            return;
        }
        System.out.println("\nDATE        ITEM                 SOLD   WEEKDAY       EVENT");
        System.out.println("----------------------------------------------------------------");
        for (SalesRecord record : records) {
            MenuItem item = service.findItemById(record.getItemId());
            String itemName = item == null ? "Unknown item" : item.getName();
            System.out.printf("%-11s %-20s %-6d %-13s %s%n",
                    record.getDate(), itemName, record.getQuantity(),
                    record.getDate().getDayOfWeek(), record.isSpecialEvent() ? "Yes" : "No");
        }
    }

    private static void createForecast() {
        MenuItem item = chooseItem();
        if (item == null) return;

        LocalDate targetDate = readDate("Enter target date to forecast (YYYY-MM-DD): ");
        int window = readPositiveInt("Use how many past sales records? (e.g. 3): ");
        boolean event = readYesNo("Is a special event expected? (y/n): ");

        ForecastResult result = service.createForecast(item, targetDate, window, event);
        if (result == null) {
            System.out.println("Not enough historical sales records for this item.");
            System.out.println("Enter past sales first, then try again.");
            return;
        }

        System.out.println("\n----------- FORECAST RESULT -----------");
        System.out.println("Menu item: " + item.getName());
        System.out.println("Target date: " + targetDate + " (" + targetDate.getDayOfWeek() + ")");
        System.out.printf("Baseline moving average: %.2f plates%n", result.getBaseline());
        if (event) {
            System.out.println("Event adjustment: +10% (illustrative assumption)");
        }
        System.out.printf("Predicted demand: %d plates%n", result.getPredictedQuantity());
        System.out.println("---------------------------------------");

        service.addForecast(result);
        service.saveData();
        System.out.println("Forecast saved. Enter actual sales after the target date.");
    }

    private static void enterActualSales() {
        List<ForecastResult> pending = service.getForecastsWithoutActuals();
        if (pending.isEmpty()) {
            System.out.println("No forecasts are waiting for actual sales.");
            return;
        }

        System.out.println("\nForecasts waiting for actual sales:");
        for (int i = 0; i < pending.size(); i++) {
            ForecastResult f = pending.get(i);
            MenuItem item = service.findItemById(f.getItemId());
            System.out.printf("%d. %s | %s | forecast: %d plates%n",
                    i + 1, item == null ? "Unknown item" : item.getName(),
                    f.getTargetDate(), f.getPredictedQuantity());
        }

        int index = readInt("Choose forecast number: ") - 1;
        if (index < 0 || index >= pending.size()) {
            System.out.println("Invalid forecast number.");
            return;
        }
        ForecastResult chosen = pending.get(index);
        if (chosen.getTargetDate().isAfter(LocalDate.now())) {
            System.out.println("That target date is in the future. Enter actual sales after that date.");
            return;
        }

        int actual = readNonNegativeInt("Enter actual quantity sold: ");
        chosen.setActualQuantity(actual);
        service.saveData();
        System.out.println("Actual sales saved. You can now view the accuracy report.");
    }

    private static void viewForecastReports() {
        List<ForecastResult> forecasts = service.getForecasts();
        if (forecasts.isEmpty()) {
            System.out.println("No forecasts yet.");
            return;
        }
        System.out.println("\nDATE        ITEM                 FORECAST ACTUAL  ABS.ERROR  ERROR %");
        System.out.println("------------------------------------------------------------------------");
        for (ForecastResult f : forecasts) {
            MenuItem item = service.findItemById(f.getItemId());
            String name = item == null ? "Unknown item" : item.getName();
            if (f.getActualQuantity() == null) {
                System.out.printf("%-11s %-20s %-8d %-7s %-10s %s%n",
                        f.getTargetDate(), name, f.getPredictedQuantity(), "-", "-", "Pending");
            } else {
                int error = Math.abs(f.getActualQuantity() - f.getPredictedQuantity());
                String percentage = f.getActualQuantity() == 0
                        ? "N/A" : String.format("%.2f%%", error * 100.0 / f.getActualQuantity());
                System.out.printf("%-11s %-20s %-8d %-7d %-10d %s%n",
                        f.getTargetDate(), name, f.getPredictedQuantity(),
                        f.getActualQuantity(), error, percentage);
            }
        }
        System.out.println("\nNote: Error % is not calculated when actual sales are zero.");
    }

    private static MenuItem chooseItem() {
        viewMenuItems();
        if (service.getMenuItems().isEmpty()) return null;
        int id = readInt("Enter menu item ID: ");
        MenuItem item = service.findItemById(id);
        if (item == null) System.out.println("No menu item found with that ID.");
        return item;
    }

    private static String readNonEmpty(String prompt) {
        while (true) {
            System.out.print(prompt);
            String value = scanner.nextLine().trim();
            if (!value.isEmpty()) return value;
            System.out.println("Value cannot be empty.");
        }
    }

    private static int readInt(String prompt) {
        while (true) {
            System.out.print(prompt);
            try {
                return Integer.parseInt(scanner.nextLine().trim());
            } catch (NumberFormatException ex) {
                System.out.println("Please enter a whole number.");
            }
        }
    }

    private static int readNonNegativeInt(String prompt) {
        while (true) {
            int value = readInt(prompt);
            if (value >= 0) return value;
            System.out.println("Quantity cannot be negative.");
        }
    }

    private static int readPositiveInt(String prompt) {
        while (true) {
            int value = readInt(prompt);
            if (value > 0) return value;
            System.out.println("Enter a number greater than zero.");
        }
    }

    private static LocalDate readDate(String prompt) {
        while (true) {
            System.out.print(prompt);
            try {
                return LocalDate.parse(scanner.nextLine().trim());
            } catch (DateTimeParseException ex) {
                System.out.println("Invalid date. Use YYYY-MM-DD, for example 2026-10-25.");
            }
        }
    }

    private static boolean readYesNo(String prompt) {
        while (true) {
            System.out.print(prompt);
            String answer = scanner.nextLine().trim().toLowerCase();
            if (answer.equals("y") || answer.equals("yes")) return true;
            if (answer.equals("n") || answer.equals("no")) return false;
            System.out.println("Please enter y or n.");
        }
    }
}
