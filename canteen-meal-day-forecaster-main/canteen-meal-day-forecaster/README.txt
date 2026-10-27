CANTEEN MEAL DAY FORECASTER
==========================

A beginner-friendly web app for planning campus canteen meals. It uses a small
Java HTTP server, plain HTML/CSS/JavaScript, and CSV files. No Spring Boot,
Node.js, database, build tool, or internet connection is required.

REQUIREMENTS
------------
- JDK 17 or newer (both java and javac available on PATH)
- A modern web browser
- Windows

START ON WINDOWS
----------------
Option 1: Double-click "Start Canteen Forecaster.bat".

Option 2: Open PowerShell or Command Prompt in this project folder and run:

    javac --add-modules jdk.httpserver -d out src\*.java
    java --add-modules jdk.httpserver -cp out CanteenWebServer

Then open this address in your browser:

    http://localhost:8080

Keep the terminal window open while using the application. Press Ctrl+C in
that window to stop it. If port 8080 is already in use, run the server with a
different port:

    java --add-modules jdk.httpserver -cp out CanteenWebServer 8081

Then visit http://localhost:8081.

FEATURES
--------
- Dashboard with today's totals, a recent-sales chart, upcoming events, and a
  simple average-based meal estimate.
- Add and delete menu items.
- Record daily sales by menu item and date.
- Add and delete campus events.
- Forecast demand from the average of the most recent sales records before a
  selected date. Scheduled event days receive an illustrative +10% uplift.
- Record actual sales and compare them to saved forecasts.
- Responsive layout with six navigation sections.
- Data automatically saved in the data folder as CSV files.
- Sample menu items, recent sales, and campus events are created automatically
  the first time the app starts with empty data files.

DATA AND FORECAST NOTES
----------------------
- Menu items, sales, and forecasts are stored in data\menu-items.csv,
  data\sales.csv, and data\forecasts.csv.
- Events are stored in data\events.csv.
- The daily sales form keeps one total per menu item and date; saving that
  item/date again updates the existing total.
- A forecast only uses sales dated before its forecast date.
- The +10% event adjustment is a simple illustrative assumption, not a
  statistically trained effect.
- Accuracy is not calculated when actual sales are zero.
- Deleting a menu item also removes its sales and forecasts.

PROJECT STRUCTURE
-----------------
src\Main.java             Existing console version of the project
src\CanteenWebServer.java Java web server and API
src\CanteenService.java   Forecast logic and CSV persistence
src\MenuItem.java         Menu item model
src\SalesRecord.java      Sales record model
src\ForecastResult.java   Forecast and actual sales model
src\web\index.html        Web application pages
src\web\styles.css        Responsive dashboard styling
src\web\app.js            Navigation, forms, charts, and calculations
data\                     Created automatically for saved CSV data
out\                      Compiled Java classes

This project demonstrates Java classes and objects, collections, methods,
file handling, LocalDate, a lightweight built-in HTTP server, and a plain
browser frontend without additional frameworks.
