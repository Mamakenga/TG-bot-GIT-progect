// src/dashboard/DashboardService.ts
import { Database } from '../database';
import { DashboardTemplates } from './templates/DashboardTemplates';

export class DashboardService {
  constructor(private database: Database) {}

  async getMainDashboard(): Promise<string> {
    try {
      const stats = await this.database.getStats();
      return DashboardTemplates.getMainTemplate(stats);
    } catch (error) {
      return DashboardTemplates.getErrorTemplate(`Ошибка загрузки статистики: ${error}`);
    }
  }

  async getWeeklyReport(): Promise<string> {
    try {
      const stats = await this.database.getStats();
      return DashboardTemplates.getMainTemplate(stats);
    } catch (error) {
      return DashboardTemplates.getErrorTemplate(`Ошибка загрузки отчета: ${error}`);
    }
  }

  async exportToCSV(data: any[], type: string): Promise<string> {
    try {
      // Простой CSV экспорт
      if (!data || data.length === 0) {
        return 'No data available';
      }

      const headers = Object.keys(data[0]);
      let csv = '\ufeff'; // BOM для корректного отображения кириллицы
      csv += headers.join(',') + '\n';
      
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csv += values.join(',') + '\n';
      });

      return csv;
    } catch (error) {
      throw new Error(`Ошибка создания CSV: ${error}`);
    }
  }
}
