CANTEEN MEAL DEMAND FORECASTER — JAVA CONSOLE PROJECT

REQUIREMENTS
- JDK 17 or newer recommended
- VS Code
- VS Code Extension Pack for Java (recommended)

RUN IN VS CODE
1. Extract the ZIP file.
2. Open the extracted CanteenMealDemandForecaster folder in VS Code.
3. Open src/Main.java.
4. Click Run, or use the terminal instructions below.

RUN FROM TERMINAL
Open a terminal in the project folder and run:

    javac -d out src/*.java
    java -cp out Main

FEATURES
- Add and view menu items
- Enter historical sales with dates and special-event flags
- Forecast demand using the average of the most recent N sales records before the target date
- Optional illustrative +10% adjustment when the target date has a special event
- Enter actual sales for a forecast after its target date
- View absolute error and absolute percentage error
- Save data to CSV files in the data/ folder

IMPORTANT NOTES
- The event adjustment is an example assumption, not a proven real-world effect.
- The program needs at least one earlier sales record for the selected menu item to make a forecast.
- Percentage error is shown as N/A when actual sales are zero.
- Data is saved in the data/ folder when you save/exit and after most updates.
- This is a student prototype, not a commercial-ready product.

SUGGESTED DEMO
1. Add "Masala Dosa".
2. Enter past sales for dates before the target date, e.g. 2026-10-20 = 60,
   2026-10-21 = 75, and 2026-10-22 = 90.
3. Forecast for 2026-10-23 using 3 records, with no event.
   Expected baseline: 75.00, predicted quantity: 75.
4. Enter actual sales for the target date. If the date is in the future,
   the program intentionally prevents entering actual sales until that date.
5. View forecast accuracy reports.

PROJECT STRUCTURE
src/
  Main.java            Console menu and user interaction
  MenuItem.java        Menu item data class
  SalesRecord.java     Historical sales data class
  ForecastResult.java  Forecast and actual sales data class
  CanteenService.java  Forecast logic and CSV persistence

This project uses basic Java classes, objects, constructors, encapsulation,
methods, ArrayList collections, loops, conditionals, Scanner input, exception
handling, LocalDate, and file handling.
