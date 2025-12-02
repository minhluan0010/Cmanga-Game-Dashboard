// File: donation_checker.js

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Cấu hình
const API_DOMAIN = process.env.API_DOMAIN || 'cmangax8.com';
const GUILD_IDS_TO_CHECK = ['64', '40']; 
const HISTORY_FILE = 'donation_history.json'; // Tên file sẽ được commit lên GitHub

function getApiUrl(path) {
    return `https://${API_DOMAIN}${path}`;
}

// Lấy ngày hôm nay theo format YYYY-MM-DD
function getTodayDate() {
    const d = new Date();
    // Action chạy lúc 16:40 UTC, tương đương 23:40 ICT. 
    // Dùng d.getDate() sẽ lấy ngày UTC, khớp với ngày ICT khi chạy lúc 23h40
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Lấy key tháng YYYY-MM
function getCurrentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Gọi API để lấy danh sách ID đã cống vàng
async function fetchDonationData(guildId) {
    try {
        const [memRes, infoRes] = await Promise.all([
            fetch(getApiUrl(`/api/game_guild_member?waiting=0&guild=${guildId}`)),
            fetch(getApiUrl(`/api/get_data_by_id?table=game_guild&data=data,donate&id=${guildId}`))
        ]);

        const members = await memRes.json();
        const infoWrap = await infoRes.json();

        if (!infoWrap.data) throw new Error(`Guild ID ${guildId} not found`);

        const donationMap = infoWrap.donate ? JSON.parse(infoWrap.donate) : {};
        const dailyDonatedIds = {}; // { charId: true }
        const guildInfo = JSON.parse(infoWrap.data);

        members.forEach(m => {
            const id = m.id_game_character;
            const amt = parseInt(donationMap[id] || 0);
            // Chỉ cần biết ID nào đã cống (amt > 0)
            if (amt > 0) {
                dailyDonatedIds[id] = true;
            }
        });

        return {
            guildId: guildId,
            name: guildInfo.name,
            donatedIds: dailyDonatedIds,
            members: members // Trả về danh sách thành viên để tính thống kê tên
        };

    } catch (e) {
        console.error(`Error fetching data for Guild ${guildId}:`, e.message);
        return null;
    }
}

// Tải lịch sử đã lưu trên GitHub
function loadExistingHistory() {
    try {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.log("No existing history file found or failed to parse. Starting fresh.");
        return {};
    }
}

async function run() {
    console.log(`--- Running Daily Donation Check (${getTodayDate()}) ---`);

    const existingHistory = loadExistingHistory();
    const today = getTodayDate();
    const monthKey = getCurrentMonthKey();
    let updatedHistory = { ...existingHistory };

    for (const guildId of GUILD_IDS_TO_CHECK) {
        const data = await fetchDonationData(guildId);

        if (data && Object.keys(data.donatedIds).length > 0) {
            console.log(`[SUCCESS] Guild ${guildId} (${data.name}) found ${Object.keys(data.donatedIds).length} donors.`);

            // Cấu trúc: { guildId: { monthKey: { dateKey: { charId: true, ... } } } }
            if (!updatedHistory[guildId]) updatedHistory[guildId] = {};
            if (!updatedHistory[guildId][monthKey]) updatedHistory[guildId][monthKey] = {};

            // Lưu dữ liệu ngày hôm nay
            updatedHistory[guildId][monthKey][today] = data.donatedIds;
            
            // Thêm/cập nhật danh sách thành viên cho guild đó (cần thiết cho frontend)
            // Lưu membersList để frontend có thể hiển thị Tên (Name) thay vì chỉ ID
            updatedHistory[guildId].members = data.members.map(m => ({
                id: m.id_game_character,
                name: JSON.parse(m.info).name
            }));

        } else if (data) {
            console.log(`[SKIP] Guild ${guildId} (${data.name}) found 0 donors.`);
        }
    }

    // Ghi file JSON đã cập nhật
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2), 'utf8');
        console.log(`Successfully updated and saved ${HISTORY_FILE}`);
    } catch (e) {
        console.error("Failed to write history file:", e);
        process.exit(1);
    }
}

run();
