import { execSync } from 'child_process';
import fs from 'fs';

console.log('🔍 開始執行依賴項健康度與授權檢查...\n');

try {
  // 1. 檢查安全漏洞 (npm audit)
  console.log('🛡️ 1. 執行安全漏洞掃描 (npm audit)...');
  try {
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const auditResult = JSON.parse(auditOutput);
    const vulnerabilities = auditResult.metadata.vulnerabilities;
    
    console.log(`✅ 掃描完成。發現漏洞：`);
    console.log(`   - 資訊 (Info): ${vulnerabilities.info}`);
    console.log(`   - 低危險 (Low): ${vulnerabilities.low}`);
    console.log(`   - 中危險 (Moderate): ${vulnerabilities.moderate}`);
    console.log(`   - 高危險 (High): ${vulnerabilities.high}`);
    console.log(`   - 極高危險 (Critical): ${vulnerabilities.critical}`);
    
    if (vulnerabilities.high > 0 || vulnerabilities.critical > 0) {
      console.warn('⚠️ 警告：發現高危險或極高危險漏洞，建議立即執行 `npm audit fix`！');
    }
  } catch (error) {
    if (error.stdout) {
      const auditResult = JSON.parse(error.stdout);
      const vulnerabilities = auditResult.metadata.vulnerabilities;
      console.log(`❌ 掃描完成，發現漏洞：`);
      console.log(`   - 資訊 (Info): ${vulnerabilities.info}`);
      console.log(`   - 低危險 (Low): ${vulnerabilities.low}`);
      console.log(`   - 中危險 (Moderate): ${vulnerabilities.moderate}`);
      console.log(`   - 高危險 (High): ${vulnerabilities.high}`);
      console.log(`   - 極高危險 (Critical): ${vulnerabilities.critical}`);
      console.warn('⚠️ 警告：建議執行 `npm audit fix` 來修復漏洞！');
    } else {
      console.error('執行 npm audit 失敗:', error.message);
    }
  }

  console.log('\n----------------------------------------\n');

  // 2. 檢查授權合規性 (license-checker)
  console.log('📜 2. 執行授權合規性檢查 (license-checker)...');
  try {
    const licenseOutput = execSync('npx license-checker --summary', { encoding: 'utf-8' });
    console.log(licenseOutput);
    
    // 檢查是否有 GPL 授權
    const fullLicenseOutput = execSync('npx license-checker --json', { encoding: 'utf-8' });
    const licenses = JSON.parse(fullLicenseOutput);
    const gplPackages = Object.keys(licenses).filter(pkg => {
      const license = licenses[pkg].licenses;
      return typeof license === 'string' && license.toLowerCase().includes('gpl');
    });

    if (gplPackages.length > 0) {
      console.warn('⚠️ 警告：發現包含 GPL 授權的套件，請確認是否符合您的商業授權需求：');
      gplPackages.forEach(pkg => console.log(`   - ${pkg} (${licenses[pkg].licenses})`));
    } else {
      console.log('✅ 未發現 GPL 授權套件，授權合規性良好。');
    }
  } catch (error) {
    console.error('執行 license-checker 失敗:', error.message);
  }

  console.log('\n----------------------------------------\n');

  // 3. 檢查過期套件 (npm outdated)
  console.log('⏳ 3. 執行過期套件檢查 (npm outdated)...');
  try {
    execSync('npm outdated', { encoding: 'utf-8', stdio: 'inherit' });
    console.log('✅ 所有套件皆為最新版本。');
  } catch (error) {
    // npm outdated returns exit code 1 if there are outdated packages
    console.log('⚠️ 發現過期套件，請考慮更新（但請注意重大變更 Breaking Changes）。');
  }

  console.log('\n🎉 檢查完畢！請根據上述報告進行必要的調整。');

} catch (err) {
  console.error('腳本執行發生未預期的錯誤:', err);
}
