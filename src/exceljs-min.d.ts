declare module 'exceljs/dist/exceljs.min.js' {
  import type ExcelJS from 'exceljs';
  const excelJs: typeof ExcelJS;
  export default excelJs;
}
