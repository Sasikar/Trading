import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.interactions.Action;
import org.openqa.selenium.interactions.Actions;

public class Auto {

    public static void main(String[] args) throws InterruptedException {

        // System Property for Chrome Driver
        System.setProperty("webdriver.chrome.driver", "C:\\Users\\Admin\\Downloads\\chromedriver_win32 (2)\\chromedriver.exe");

        System.setProperty("webdriver.chrome.verboseLogging", "true");

        ChromeOptions options = new ChromeOptions();
        // Instantiate a ChromeDriver class.
        options.setExperimentalOption("debuggerAddress", "http://localhost:8888");
        WebDriver driver=new ChromeDriver(options);

        // Launch Website
        driver.navigate().to("https://chartink.com/");

        //Maximize the browser
        driver.manage().window().maximize();

        //Scroll down the webpage by 5000 pixels
        JavascriptExecutor js = (JavascriptExecutor)driver;
        js.executeScript("scrollBy(0, 5000)");

         driver.findElement(By.xpath("(//a[normalize-space()='Login/Register'])[1]")).click();
         //   driver.findElement(By.xpath("//button[@class='gsc-search-button gsc-search-button-v2']")).click();
        // Click on the Search button
     //   driver.findElement(By.linkText("Core Java")).click();

      //  (//input[@id='email'])[1]
        //input[@id='email']
        Thread.sleep(2000);
                driver.findElement(By.xpath("//input[@id='email']")).sendKeys("sasipudi@gmail.com");
       // (//input[@id='password'])[1]
                driver.findElement(By.xpath("//input[@id='password']")).sendKeys("Chartink@44");
        //(//span[normalize-space()='Login'])[1]
                driver.findElement(By.xpath("//button[@class='g-recaptcha']")).click();

                Thread.sleep(2000);
        driver.switchTo().activeElement();
        Thread.sleep(2000);
        driver.findElement(By.xpath("//button[@id='onesignal-slidedown-cancel-button']")).click();
        Thread.sleep(500);

        driver.findElement(By.xpath("//a[normalize-space()='Dashboards']")).click();
        //a[normalize-space()='Dashboards']

        Thread.sleep(500);


        driver.findElement(By.xpath("//a[normalize-space()='ATH & CCI INDICATOR']")).click();

       // driver.switchTo().alert().dismiss();
       // driver.findElement(By.partialLinkText("Intraday Traders desk")).click();

        //onesignal-slidedown-cancel-button


        //driver.switchTo().activeElement().click();
           //   driver.findElement(By.xpath("//button[@id='onesignal-slidedown-cancel-button']")).click();
              Thread.sleep(500);

        //div[5]//div[1]//div[1]//div[1]//div[2]//div[4]//a[1]//i[1]

      //  driver.findElement(By.xpath("//div[5]//div[1]//div[1]//div[1]//div[2]//div[4]//a[1]//i[1]")).click();

        //div[normalize-space()='ATH With Gapup']

       /* var webE= driver.findElement(By.xpath("//div[normalize-space()='ATH With Gapup']"));

        Actions builder = new Actions(driver);
        Action mouseOverHome = builder
                .moveToElement(webE)
                .build();

        mouseOverHome.perform();
        Thread.sleep(100);
       //*[@class='ml-2 mr-2 cursor-pointer']

        driver.findElement(By.xpath("//*[@class='ml-2 mr-2 cursor-pointer']")).click();*/

      Thread.sleep(1000);
        var webE1= driver.findElement(By.xpath("//div[normalize-space()='Upper bollinger bands and cci']"));

        Actions builder1 = new Actions(driver);
        Action mouseOverHome1 = builder1
                .moveToElement(webE1)
                .build();

        mouseOverHome1.perform();
        Thread.sleep(1000);
        //*[@class='ml-2 mr-2 cursor-pointer']

        driver.findElement(By.xpath("//*[@title='Download results']")).click();



    }

}  