require("dotenv").config();
const fs = require('fs');
const axios = require('axios');
const ExcelJS = require('exceljs');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const url = process.env.URL_DEP;
const batchSize = 10000;
const projects = {
    "eclipsebet.com": 1868048,
    "moyobet.ke": 18757058,
    "moyobet.com": 18754737
};

// Функция для форматирования даты
function formatDate(dateString) {
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
}

const fetchData = async (project, fromDate, toDate) => {
    let skeepRows = 0;
    const filename = `deposits_${project}_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, 'files', filename);  // Путь к файлу в папке "files"
    
    // Проверка на существование папки и создание, если её нет
    const dirPath = path.join(__dirname, 'files');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }

    const workbook = new ExcelJS.Workbook();
    let worksheet = workbook.addWorksheet('Deposits');
    worksheet.columns = [
        { header: 'ClientId', key: 'ClientId', width: 15 },
        { header: 'ClientLogin', key: 'ClientLogin', width: 15 },
        { header: 'UserName', key: 'UserName', width: 15 },
        { header: 'TypeId', key: 'TypeId', width: 10 },
        { header: 'CurrencyId', key: 'CurrencyId', width: 10 },
        { header: 'Amount', key: 'Amount', width: 10 },
        { header: 'PaymentSystemName', key: 'PaymentSystemName', width: 20 },
        { header: 'CreatedDate', key: 'CreatedDate', width: 20 },
        { header: 'PartnerId', key: 'PartnerId', width: 15 },
        { header: 'Id', key: 'Id', width: 15 }
    ];

    let totalCount = 0;
    let fetchedCount = 0;

    do {
        const requestBody = {
            filter: {
                AmountFrom: "",
                AmountTo: "",
                CashDeskId: "",
                ClientId: "",
                Currency: "",
                CurrencyId: "",
                DefaultCurrencyId: "USD",
                FromCreatedDateLocal: fromDate + " - 00:00:00",
                ToCreatedDateLocal: toDate + " - 00:00:00",
                SkeepRows: skeepRows,
                OrderedItem: 1,
                IsOrderedDesc: true,
                IsTest: false,
                MaxRows: 10000
            },
            project: project
        };

        let success = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!success && retryCount < maxRetries) {
            try {
                console.log(`Fetching data for ${project} with SkeepRows = ${skeepRows}, Attempt = ${retryCount + 1}`);
                const response = await axios.post(url, requestBody);
                if (!response.data.success || response.data.data.HasError) {
                    console.error('Error in response:', response.data.data.AlertMessage);
                    break;
                }

                const { Documents } = response.data.data.Data;
                totalCount = Documents.Count;
                fetchedCount += Documents.Objects.length;

                Documents.Objects.forEach(doc => {
                    worksheet.addRow({
                        ClientId: doc.ClientId,
                        ClientLogin: doc.ClientLogin,
                        UserName: doc.UserName,
                        TypeId: doc.TypeId,
                        CurrencyId: doc.CurrencyId,
                        Amount: doc.Amount,
                        PaymentSystemName: doc.PaymentSystemName,
                        CreatedDate: formatDate(doc.CreatedLocal),
                        PartnerId: doc.PartnerId,
                        Id: doc.Id
                    });
                });

                await workbook.xlsx.writeFile(filePath);  // Сохраняем файл в папку "files"
                console.log(`Saved ${Documents.Objects.length} records to ${filePath}`);

                success = true;
            } catch (error) {
                console.error('Request failed:', error.message);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.error('Max retries reached. Skipping this batch.');
                    break;
                }
            }
        }

        skeepRows += batchSize;
    } while (fetchedCount < totalCount);  // Continue fetching data until all records are retrieved

    return { totalCount, fetchedCount, filename };  // Return the results after fetching all data
};

app.get("/", (req, res) => {
  res.send("Get data is running...");
});

app.post('/fetch', async (req, res) => {
    const { project, fromDate, toDate } = req.body;

    if (!projects[project]) return res.status(400).json({ error: 'Invalid project' });

    try {
        const { totalCount, fetchedCount, filename } = await fetchData(projects[project], fromDate, toDate);

        res.json({
            totalCount,
            fetchedCount,
            filename
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Error fetching data' });
    }
});

app.get('/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'files', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));
