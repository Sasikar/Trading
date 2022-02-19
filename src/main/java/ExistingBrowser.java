import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.commons.io.FileUtils;

import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.w3c.dom.Document;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.event.KeyEvent;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

public class ExistingBrowser{
    public static void main(String[] args)
            throws InterruptedException, AWTException, IOException, TesseractException {
        System.setProperty("webdriver.chrome.driver", "C:\\Users\\Admin\\Downloads\\latest\\chromedriver.exe");
        System.setProperty("TESSDATA_PREFIX", "C:\\Users\\Admin\\Downloads\\tessdata-3.04.00\\tessdata");

        //get browser capabilities in key value pairs

        ChromeOptions o = new ChromeOptions();
        o.setExperimentalOption("debuggerAddress","127.0.0.1:9898");
        WebDriver driver = new ChromeDriver(o);
        //set implicit wait
        driver.manage().timeouts().implicitlyWait(5, TimeUnit.SECONDS);
        driver.navigate().to("https://in.tradingview.com/chart/q8S2jrCs");
 Thread.sleep(5000);



        //div[@class='headerButton-uV8zMgPt button-1SoiPS-f apply-common-tooltip']//span//*[name()='svg']
        //div[@class='headerButton-uV8zMgPt button-1SoiPS-f apply-common-tooltip isOpened-1SoiPS-f']//span//*[name()='svg']

        driver.findElement(By.xpath("//div[@class='headerButton-uV8zMgPt button-1SoiPS-f apply-common-tooltip']//span//*[name()='svg']")).click();
       Thread.sleep(2000);
        driver.findElement(By.xpath("//div[@id='overlap-manager-root']//div[4]//div[2]//div[1]")).click();
        Thread.sleep(1000);
         driver.findElement(By.xpath("//input[@type='file']")).sendKeys("C:\\Users\\Admin\\Downloads\\nse.txt");
       //  driver.close();
        Robot robot = new Robot();
        robot.keyPress(KeyEvent.VK_ESCAPE);
        robot.keyRelease(KeyEvent.VK_ESCAPE);
        Thread.sleep(1000);

         /*   driver.findElement(By.xpath("//span[normalize-space()='VEDL']")).click();
            System.out.println(driver.getPageSource());*/
           driver.findElement(By.xpath("//span[normalize-space()='CIPLA']")).click();
            System.out.println(driver.getPageSource());








    }
}
