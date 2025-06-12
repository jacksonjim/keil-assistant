let instance: Time;

//Format Example: 2019/9/22|10:12:23|GMT...

export type TimeInfo = {
    year: number;
    month: number;
    date: number;

    hour: number;
    minute: number;
    second: number;

    region: string;
}

export class Time {

    private date: Date;
    private separater: string;

    private constructor() {
        this.date = new Date();
        this.separater = '|';
    }

    static getInstance(): Time {
        if (instance) {
            return instance;
        }
        instance = new Time();

        return instance;
    }

    getTimeStamp(): string {
        this.date.setTime(Date.now());
        let dateStr = this.getDateString();
        const tList = this.date.toTimeString().split(' ');

        dateStr += this.separater + tList[0] + this.separater + tList[1];

        return dateStr;
    }

    private getDateString(): string {
        return `${this.date.getFullYear().toString()  }/${  (this.date.getMonth() + 1).toString()  }/${  this.date.getDate().toString()}`;
    }

    getTimeInfo(): TimeInfo {

        this.date.setTime(Date.now());

        return {
            year: this.date.getFullYear(),
            month: this.date.getMonth(),
            date: this.date.getDate(),

            hour: this.date.getHours(),
            minute: this.date.getMinutes(),
            second: this.date.getSeconds(),

            region: this.date.toTimeString().split(' ')[1]
        };
    }

    parse(timeStamp: string): TimeInfo {

        const fieldList = timeStamp.split('|');
        const yearField = fieldList[0].split('/');
        const timeField = fieldList[1].split(':');

        return {
            year: Number.parseInt(yearField[0]),
            month: Number.parseInt(yearField[1]),
            date: Number.parseInt(yearField[2]),

            hour: Number.parseInt(timeField[0]),
            minute: Number.parseInt(timeField[1]),
            second: Number.parseInt(timeField[2]),

            region: fieldList[2]
        };
    }

    stringify(timeData: TimeInfo): string {
        return `${timeData.year.toString()  }/${  timeData.month.toString()  }/${  timeData.date.toString()  }|${
             timeData.hour.toString()  }:${  timeData.minute.toString()  }:${  timeData.second.toString()  }|${
             timeData.region}`;
    }

    setTimeSeparater(sep: string) {
        this.separater = sep;
    }

    getTimeSeparater(): string {
        return this.separater;
    }
}