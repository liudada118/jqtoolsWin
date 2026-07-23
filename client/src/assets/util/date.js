export function msToHMS(ms) {
    if(ms < 0){
        return '00:00:00'
    }
  let totalSeconds = Math.floor(ms / 1000);

  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;

  // 补零
  hours = String(hours).padStart(2, '0');
  minutes = String(minutes).padStart(2, '0');
  seconds = String(seconds).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}