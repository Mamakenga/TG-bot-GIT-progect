// scripts/check-progress.js
const fs = require('fs');

function checkRefactoringProgress() {
  console.log('📊 Проверка прогресса рефакторинга...\n');

  // Анализ размера основного файла
  const botFile = 'src/bot.ts';
  if (fs.existsSync(botFile)) {
    const content = fs.readFileSync(botFile, 'utf8');
    const lines = content.split('\n').length;
    const methods = (content.match(/private async \w+/g) || []).length;
    const htmlLines = (content.match(/<!DOCTYPE html>/g) || []).length;
    
    console.log('📄 Анализ bot.ts:');
    console.log(`   Строк: ${lines} ${lines > 1000 ? '❌ (слишком много)' : lines > 500 ? '⚠️ (много)' : '✅ (норма)'}`);
    console.log(`   Методов: ${methods} ${methods > 20 ? '❌' : methods > 10 ? '⚠️' : '✅'}`);
    console.log(`   HTML блоков: ${htmlLines} ${htmlLines > 0 ? '❌ (нужно вынести)' : '✅ (чисто)'}`);
  }

  // Проверка созданных модулей
  const expectedModules = [
    'src/utils/Logger.ts',
    'src/dashboard/DashboardService.ts',
    'src/dashboard/templates/DashboardTemplates.ts',
    'src/server/ExpressServer.ts',
    'src/server/routes/adminRoutes.ts',
    'src/server/routes/webhookRoutes.ts',
    'src/handlers/CommandHandlers.ts',
    'src/keyboards/KeyboardManager.ts',
    'src/scheduling/ReminderScheduler.ts'
  ];

  console.log('\n📦 Проверка модулей:');
  let completedModules = 0;
  
  expectedModules.forEach(module => {
    const exists = fs.existsSync(module);
    console.log(`   ${exists ? '✅' : '❌'} ${module}`);
    if (exists) completedModules++;
  });

  // Подсчет прогресса
  const progress = Math.round((completedModules / expectedModules.length) * 100);
  console.log(`\n📈 Прогресс: ${progress}%`);
  console.log(`${'▓'.repeat(Math.floor(progress / 10))}${'░'.repeat(10 - Math.floor(progress / 10))}`);

  // Рекомендации
  console.log('\n💡 Следующие шаги:');
  if (progress < 20) {
    console.log('   1. Создайте Logger и начните заменять console.log');
    console.log('   2. Вынесите HTML шаблоны в отдельные файлы');
  } else if (progress < 50) {
    console.log('   1. Выделите ExpressServer из основного класса');
    console.log('   2. Создайте CommandHandlers для обработки команд');
  } else if (progress < 80) {
    console.log('   1. Вынесите систему напоминаний в ReminderScheduler');
    console.log('   2. Создайте KeyboardManager для управления клавиатурами');
  } else {
    console.log('   🎉 Рефакторинг почти завершен!');
    console.log('   Осталось добавить тесты и финальная проверка');
  }

  // Проверка работоспособности
  console.log('\n🔧 Проверка работоспособности:');
  console.log('   Запустите: npm run dev');
  console.log('   Проверьте: /start команду в боте');
  console.log('   Откройте: http://localhost:3000/dashboard');
}

// Дополнительная функция для проверки после каждого шага
function validateStep(stepName) {
  console.log(`\n🔍 Проверка шага: ${stepName}`);
  
  try {
    // Проверяем компиляцию TypeScript
    require('child_process').execSync('npx tsc --noEmit', { stdio: 'pipe' });
    console.log('✅ TypeScript компилируется без ошибок');
  } catch (error) {
    console.log('❌ Ошибки TypeScript:', error.stdout?.toString());
    return false;
  }

  console.log('✅ Шаг выполнен успешно!');
  return true;
}

// Если скрипт запущен напрямую
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'validate') {
    const stepName = process.argv[3] || 'текущий шаг';
    validateStep(stepName);
  } else {
    checkRefactoringProgress();
  }
}

module.exports = { checkRefactoringProgress, validateStep };