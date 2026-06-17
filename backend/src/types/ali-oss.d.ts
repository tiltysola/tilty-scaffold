declare module 'ali-oss' {
  class OSS {
    constructor(options: OSS.Options);

    delete(name: string): Promise<void>;
    put(name: string, file: Buffer, options?: OSS.PutOptions): Promise<OSS.PutResult>;
  }

  namespace OSS {
    interface Options {
      accessKeyId: string;
      accessKeySecret: string;
      bucket: string;
      endpoint?: string;
      region: string;
      secure?: boolean;
      timeout?: number;
    }

    interface PutOptions {
      headers?: Record<string, string>;
      mime?: string;
      timeout?: number;
    }

    interface PutResult {
      name: string;
      url?: string;
    }
  }

  export = OSS;
}
