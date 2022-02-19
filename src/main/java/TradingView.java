import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.interactions.Action;
import org.openqa.selenium.interactions.Actions;

import java.util.Set;

public class TradingView {

    public static void main(String[] args) throws InterruptedException {

        // System Property for Chrome Driver
        System.setProperty("webdriver.chrome.driver", "C:\\Users\\Admin\\Downloads\\latest\\\\chromedriver.exe");

        // Instantiate a ChromeDriver class.
        WebDriver driver=new ChromeDriver();

        //Maximize the browser
        driver.manage().window().maximize();

        // Launch Website
        driver.navigate().to("https://in.tradingview.com/");




        var accountLogin = "//button[@class='tv-header__user-menu-button tv-header__user-menu-button--anonymous js-header-user-menu-button']";
        driver.findElement(By.xpath(accountLogin)).click();

        Thread.sleep(500);
        var signIn = "//div[contains(text(),'Sign in')]";
        driver.findElement(By.xpath(signIn)).click();


        String mainWindow = driver.getWindowHandle();
        Set<String> handles = driver.getWindowHandles();
        for (String handle : handles) {
            if (!handle.equals(mainWindow)) {
                driver.switchTo().window(handle);
                break;
            }
        }



        Thread.sleep(500);
        var emailBox = "//span[@class='tv-signin-dialog__social tv-signin-dialog__toggle-email js-show-email']";
        driver.findElement(By.xpath(emailBox)).click();


        Thread.sleep(500);
        var name = " //input[contains(@id,'email-signin__user-name-input')]";
        driver.findElement(By.xpath(name)).sendKeys("Vtrader665");

        Thread.sleep(500);
        var pass ="//input[contains(@id, 'email-signin__password-input')]";
        driver.findElement(By.xpath(pass)).sendKeys("Prime@44");


        var buttonSubmit =  "//span[@class='tv-button__loader']";
        driver.findElement(By.xpath(buttonSubmit)).click();






       /* Set<String> handles1 = driver.getWindowHandles();
        for (String handle : handles1) {

                driver.switchTo().window(handle).close();


        }*/
    }

}  