import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CanteenWebServer {
    private static final CanteenService service = new CanteenService();
    private static final List<CollegeEvent> events = new ArrayList<>();
    private static final Path eventsFile = Path.of("data", "events.csv");
    private static int nextEventId = 1;
    private static Path webDirectory;

    public static void main(String[] args) throws IOException {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        service.loadData();
        loadEvents();
        seedSampleData();
        webDirectory = findWebDirectory();

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", CanteenWebServer::handleRequest);
        server.start();
        System.out.println("Canteen Meal Day Forecaster is running at http://localhost:" + port);
        System.out.println("Press Ctrl+C to stop the server.");
    }

    private static void handleRequest(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();
        try {
            if (path.startsWith("/api/")) {
                handleApi(exchange, path, method);
            } else if ("GET".equals(method)) {
                serveFile(exchange, path);
            } else {
                sendJson(exchange, 405, "{\"error\":\"Method not allowed.\"}");
            }
        } catch (IllegalArgumentException | java.time.DateTimeException ex) {
            sendJson(exchange, 400, jsonObject("error", ex.getMessage()));
        } catch (IOException ex) {
            sendJson(exchange, 500, jsonObject("error", "Could not save data: " + ex.getMessage()));
        }
    }

    private static void handleApi(HttpExchange exchange, String path, String method) throws IOException {
        if ("/api/data".equals(path) && "GET".equals(method)) {
            sendJson(exchange, 200, getDataJson());
            return;
        }

        Map<String, String> form = "GET".equals(method)
                ? new HashMap<>() : parseForm(exchange);

        if ("/api/menu".equals(path) && "POST".equals(method)) {
            String name = required(form, "name").trim();
            if (name.isEmpty()) throw new IllegalArgumentException("Enter a food item name.");
            if (service.findItemByName(name) != null) {
                throw new IllegalArgumentException("That food item is already on the menu.");
            }
            service.addMenuItem(name);
            service.persist();
            sendJson(exchange, 201, "{\"ok\":true}");
        } else if ("/api/menu".equals(path) && "DELETE".equals(method)) {
            int id = queryInt(exchange, "id");
            if (!service.deleteMenuItem(id)) throw new IllegalArgumentException("Menu item not found.");
            service.persist();
            sendJson(exchange, 200, "{\"ok\":true}");
        } else if ("/api/sales".equals(path) && "POST".equals(method)) {
            int itemId = positiveInt(required(form, "itemId"), "Choose a menu item.");
            if (service.findItemById(itemId) == null) throw new IllegalArgumentException("Menu item not found.");
            LocalDate date = LocalDate.parse(required(form, "date"));
            int quantity = nonNegativeInt(required(form, "quantity"), "Quantity must be zero or more.");
            boolean eventDay = Boolean.parseBoolean(form.getOrDefault("specialEvent", "false"));
            service.saveDailySales(new SalesRecord(itemId, date, quantity, eventDay));
            service.persist();
            sendJson(exchange, 201, "{\"ok\":true}");
        } else if ("/api/events".equals(path) && "POST".equals(method)) {
            String name = required(form, "name").trim();
            if (name.isEmpty()) throw new IllegalArgumentException("Enter an event name.");
            LocalDate date = LocalDate.parse(required(form, "date"));
            String details = form.getOrDefault("details", "").trim();
            events.add(new CollegeEvent(nextEventId++, name, date, details));
            saveEvents();
            sendJson(exchange, 201, "{\"ok\":true}");
        } else if ("/api/events".equals(path) && "DELETE".equals(method)) {
            int id = queryInt(exchange, "id");
            if (!events.removeIf(event -> event.id == id)) throw new IllegalArgumentException("Event not found.");
            saveEvents();
            sendJson(exchange, 200, "{\"ok\":true}");
        } else if ("/api/forecasts".equals(path) && "POST".equals(method)) {
            int itemId = positiveInt(required(form, "itemId"), "Choose a menu item.");
            MenuItem item = service.findItemById(itemId);
            if (item == null) throw new IllegalArgumentException("Menu item not found.");
            LocalDate date = LocalDate.parse(required(form, "date"));
            int window = positiveInt(required(form, "window"), "Enter a history window greater than zero.");
            boolean eventDay = events.stream().anyMatch(event -> event.date.equals(date));
            ForecastResult forecast = service.createForecast(item, date, window, eventDay);
            if (forecast == null) {
                throw new IllegalArgumentException("Add at least one sales record before the forecast date first.");
            }
            service.addForecast(forecast);
            service.persist();
            sendJson(exchange, 201, "{\"ok\":true}");
        } else if ("/api/actual".equals(path) && "POST".equals(method)) {
            int itemId = positiveInt(required(form, "itemId"), "Menu item is missing.");
            LocalDate date = LocalDate.parse(required(form, "date"));
            int quantity = nonNegativeInt(required(form, "quantity"), "Actual sales must be zero or more.");
            if (date.isAfter(LocalDate.now())) throw new IllegalArgumentException("Actual sales cannot be entered for a future date.");
            if (!service.setActualQuantity(itemId, date, quantity)) {
                throw new IllegalArgumentException("No forecast exists for that item and date.");
            }
            service.saveDailySales(new SalesRecord(itemId, date, quantity, false));
            service.persist();
            sendJson(exchange, 200, "{\"ok\":true}");
        } else {
            sendJson(exchange, 404, "{\"error\":\"API endpoint not found.\"}");
        }
    }

    private static String getDataJson() {
        StringBuilder json = new StringBuilder("{\"today\":\"").append(LocalDate.now()).append("\",\"menu\":[");
        List<MenuItem> menu = service.getMenuItems();
        for (int i = 0; i < menu.size(); i++) {
            if (i > 0) json.append(',');
            MenuItem item = menu.get(i);
            json.append("{\"id\":").append(item.getId()).append(",\"name\":").append(quote(item.getName())).append('}');
        }
        json.append("],\"sales\":[");
        List<SalesRecord> sales = service.getSalesRecords();
        for (int i = 0; i < sales.size(); i++) {
            if (i > 0) json.append(',');
            SalesRecord record = sales.get(i);
            json.append("{\"itemId\":").append(record.getItemId())
                    .append(",\"date\":").append(quote(record.getDate().toString()))
                    .append(",\"quantity\":").append(record.getQuantity())
                    .append(",\"specialEvent\":").append(record.isSpecialEvent()).append('}');
        }
        json.append("],\"events\":[");
        for (int i = 0; i < events.size(); i++) {
            if (i > 0) json.append(',');
            CollegeEvent event = events.get(i);
            json.append("{\"id\":").append(event.id)
                    .append(",\"name\":").append(quote(event.name))
                    .append(",\"date\":").append(quote(event.date.toString()))
                    .append(",\"details\":").append(quote(event.details)).append('}');
        }
        json.append("],\"forecasts\":[");
        List<ForecastResult> forecasts = service.getForecasts();
        for (int i = 0; i < forecasts.size(); i++) {
            if (i > 0) json.append(',');
            ForecastResult forecast = forecasts.get(i);
            MenuItem item = service.findItemById(forecast.getItemId());
            json.append("{\"itemId\":").append(forecast.getItemId())
                    .append(",\"itemName\":").append(quote(item == null ? "Removed item" : item.getName()))
                    .append(",\"date\":").append(quote(forecast.getTargetDate().toString()))
                    .append(",\"predicted\":").append(forecast.getPredictedQuantity())
                    .append(",\"baseline\":").append(forecast.getBaseline())
                    .append(",\"specialEvent\":").append(forecast.isSpecialEvent())
                    .append(",\"actual\":").append(forecast.getActualQuantity() == null
                            ? "null" : forecast.getActualQuantity()).append('}');
        }
        return json.append("]}").toString();
    }

    private static void serveFile(HttpExchange exchange, String requestPath) throws IOException {
        String relativePath = "/".equals(requestPath) ? "index.html" : requestPath.substring(1);
        Path file = webDirectory.resolve(relativePath).normalize();
        if (!file.startsWith(webDirectory) || !Files.isRegularFile(file)) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        String type = relativePath.endsWith(".css") ? "text/css; charset=utf-8"
                : relativePath.endsWith(".js") ? "text/javascript; charset=utf-8"
                : "text/html; charset=utf-8";
        byte[] content = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.sendResponseHeaders(200, content.length);
        exchange.getResponseBody().write(content);
        exchange.close();
    }

    private static Map<String, String> parseForm(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> values = new HashMap<>();
        for (String pair : body.split("&")) {
            if (pair.isEmpty()) continue;
            String[] parts = pair.split("=", 2);
            values.put(decode(parts[0]), parts.length == 2 ? decode(parts[1]) : "");
        }
        return values;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String required(Map<String, String> form, String key) {
        String value = form.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing required field: " + key);
        return value;
    }

    private static int positiveInt(String value, String message) {
        try {
            int number = Integer.parseInt(value);
            if (number > 0) return number;
        } catch (NumberFormatException ignored) {
            throw new IllegalArgumentException(message);
        }
        throw new IllegalArgumentException(message);
    }

    private static int nonNegativeInt(String value, String message) {
        try {
            int number = Integer.parseInt(value);
            if (number >= 0) return number;
        } catch (NumberFormatException ignored) {
            throw new IllegalArgumentException(message);
        }
        throw new IllegalArgumentException(message);
    }

    private static int queryInt(HttpExchange exchange, String key) {
        String query = exchange.getRequestURI().getRawQuery();
        if (query != null) {
            for (String pair : query.split("&")) {
                String[] parts = pair.split("=", 2);
                if (decode(parts[0]).equals(key) && parts.length == 2) {
                    return positiveInt(decode(parts[1]), "Invalid " + key + ".");
                }
            }
        }
        throw new IllegalArgumentException("Missing " + key + ".");
    }

    private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static String jsonObject(String key, String value) {
        return "{\"" + key + "\":" + quote(value == null ? "Invalid request." : value) + "}";
    }

    private static String quote(String value) {
        StringBuilder quoted = new StringBuilder("\"");
        for (char character : value.toCharArray()) {
            switch (character) {
                case '"' -> quoted.append("\\\"");
                case '\\' -> quoted.append("\\\\");
                case '\n' -> quoted.append("\\n");
                case '\r' -> quoted.append("\\r");
                case '\t' -> quoted.append("\\t");
                default -> {
                    if (character < 32) quoted.append(String.format("\\u%04x", (int) character));
                    else quoted.append(character);
                }
            }
        }
        return quoted.append('"').toString();
    }

    private static Path findWebDirectory() throws IOException {
        Path fromProject = Path.of("src", "web").toAbsolutePath().normalize();
        Path fromSource = Path.of("web").toAbsolutePath().normalize();
        if (Files.isDirectory(fromProject)) return fromProject;
        if (Files.isDirectory(fromSource)) return fromSource;
        throw new IOException("Could not find the web folder. Start the app from the project folder.");
    }

    private static void seedSampleData() throws IOException {
        if (service.getMenuItems().isEmpty()) {
            service.addMenuItem("Masala Dosa");
            service.addMenuItem("Veg Meals");
            service.addMenuItem("Paneer Roll");
            service.addMenuItem("Chicken Biryani");
            service.addMenuItem("Idli & Vada");
        }
        if (service.getSalesRecords().isEmpty()) {
            LocalDate today = LocalDate.now();
            int itemCount = Math.min(4, service.getMenuItems().size());
            for (int itemIndex = 0; itemIndex < itemCount; itemIndex++) {
                MenuItem item = service.getMenuItems().get(itemIndex);
                for (int day = 7; day >= 1; day--) {
                    int quantity = 52 + itemIndex * 13 + (7 - day) * (itemIndex % 3 + 2)
                            + (day % 2 == 0 ? 6 : 0);
                    service.addSalesRecord(new SalesRecord(item.getId(), today.minusDays(day),
                            quantity, false));
                }
            }
        }
        if (events.isEmpty()) {
            events.add(new CollegeEvent(nextEventId++, "Student Club Meetup",
                    LocalDate.now().plusDays(3), "Campus-wide club showcase"));
            events.add(new CollegeEvent(nextEventId++, "Inter-college Sports Day",
                    LocalDate.now().plusDays(8), "Annual athletics and team events"));
        }
        service.persist();
        saveEvents();
    }

    private static void loadEvents() throws IOException {
        if (!Files.exists(eventsFile)) return;
        for (String line : Files.readAllLines(eventsFile, StandardCharsets.UTF_8)) {
            String[] parts = line.split("\t", -1);
            if (parts.length == 4) {
                int id = Integer.parseInt(parts[0]);
                events.add(new CollegeEvent(id, parts[1], LocalDate.parse(parts[2]), parts[3]));
                nextEventId = Math.max(nextEventId, id + 1);
            }
        }
    }

    private static void saveEvents() throws IOException {
        Files.createDirectories(eventsFile.getParent());
        List<String> lines = new ArrayList<>();
        for (CollegeEvent event : events) {
            lines.add(event.id + "\t" + singleLine(event.name)
                    + "\t" + event.date + "\t" + singleLine(event.details));
        }
        Files.write(eventsFile, lines, StandardCharsets.UTF_8);
    }

    private static String singleLine(String value) {
        return value.replace('\t', ' ').replace('\r', ' ').replace('\n', ' ');
    }

    private static final class CollegeEvent {
        private final int id;
        private final String name;
        private final LocalDate date;
        private final String details;

        private CollegeEvent(int id, String name, LocalDate date, String details) {
            this.id = id;
            this.name = name;
            this.date = date;
            this.details = details;
        }
    }

}
