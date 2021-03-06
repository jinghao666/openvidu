import { Observable } from 'rxjs/Rx';
import { enableDebugTools } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { OpenVidu, Session, Stream } from 'openvidu-browser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {

  private openVidu: OpenVidu;

  // Join form
  sessionId: string;
  participantId: string;

  // Session
  session: Session;
  streams: Stream[] = [];

  // Publish options
  joinWithVideo: boolean = false;
  joinWithAudio: boolean = false;
  toggleVideo: boolean;
  toggleAudio: boolean;

  //Statistics
  stats = [];
  bytesPrev = [];
  timestampPrev = [];


  constructor() {
    this.generateParticipantInfo();
    window.onbeforeunload = () => {
      this.openVidu.close(true);
    }

    //this.obtainSupportedConstraints();
  }

  private generateParticipantInfo() {
    this.sessionId = "SessionA";
    this.participantId = "Participant" + Math.floor(Math.random() * 100);
  }

  private addVideoTag(stream: Stream) {
    console.log("Stream added");
    this.streams.push(stream);

    //For statistics
    this.timestampPrev.push(0);
    this.bytesPrev.push(0);
  }

  private removeVideoTag(stream: Stream) {
    console.log("Stream removed");
    let index = this.streams.indexOf(stream);
    this.streams.splice(index, 1);

    this.stats.splice(index, 1);
    this.timestampPrev.splice(index, 1);
    this.bytesPrev.splice(index, 1);
  }

  joinSession() {
    let mediaConstraints = this.generateMediaConstraints();

    console.log(mediaConstraints);

    var cameraOptions = {
      audio: this.joinWithAudio,
      video: this.joinWithVideo,
      data: true,
      mediaConstraints: mediaConstraints
    }
    this.joinSessionShared(cameraOptions);
  }

  joinSessionShared(cameraOptions) {

    this.toggleVideo = this.joinWithVideo;
    this.toggleAudio = this.joinWithAudio;

    this.openVidu = new OpenVidu("wss://" + location.hostname + ":8443/");

    this.openVidu.connect((error, openVidu) => {

      if (error)
        return console.log(error);

      let camera = openVidu.getCamera(cameraOptions);

      camera.requestCameraAccess((error, camera) => {

        if (error)
          return console.log(error);

        var sessionOptions = {
          sessionId: this.sessionId,
          participantId: this.participantId
        }

        openVidu.joinSession(sessionOptions, (error, session) => {

          if (error)
            return console.log(error);

          this.session = session;

          this.addVideoTag(camera);

          camera.publish();

          this.intervalStats().subscribe();

          session.addEventListener("stream-added", streamEvent => {
            this.addVideoTag(streamEvent.stream);
            console.log("Stream " + streamEvent.stream + " added");
          });

          session.addEventListener("stream-removed", streamEvent => {
            this.removeVideoTag(streamEvent.stream);
            console.log("Stream " + streamEvent.stream + " removed");
          });

        });
      });
    });
  }

  leaveSession() {
    this.session = null;
    this.streams = [];
    this.openVidu.close(true);
    this.generateParticipantInfo();
  }

  updateToggleVideo(event) {
    this.openVidu.toggleLocalVideoTrack(event.target.checked);
    let msg = (event.target.checked) ? 'Publishing video...' : 'Unpublishing video...'
    console.log(msg);
  }

  updateToggleAudio(event) {
    this.openVidu.toggleLocalAudioTrack(event.target.checked);
    let msg = (event.target.checked) ? 'Publishing audio...' : 'Unpublishing audio...'
    console.log(msg);
  }

  /*obtainSupportedConstraints() {
    let constraints = Object.keys(navigator.mediaDevices.getSupportedConstraints());
    this.supportedVideoContstraints = constraints.filter((e) => {
      return this.mediaTrackSettingsVideo.indexOf(e) > -1;
    });
    this.supportedAudioContstraints = constraints.filter((e) => {
      return this.mediaTrackSettingsAudio.indexOf(e) > -1;
    });

    console.log(constraints);
    console.log(this.supportedVideoContstraints);
    console.log(this.supportedAudioContstraints);
  }*/

  generateMediaConstraints() {
    let mediaConstraints = {
      audio: true,
      video: {}
    }
    if (this.joinWithVideo) {
      mediaConstraints.video['width'] = { exact: Number((<HTMLInputElement>document.getElementById('width')).value) };
      mediaConstraints.video['height'] = { exact: Number((<HTMLInputElement>document.getElementById('height')).value) };
      mediaConstraints.video['frameRate'] = { ideal: Number((<HTMLInputElement>document.getElementById('frameRate')).value) };
    }

    return mediaConstraints;
  }


  intervalStats() {
    return Observable
      .interval(1000)
      .flatMap(() => {
        let i = 0;
        for (let str of this.streams) {
          if (str.getWebRtcPeer().peerConnection) {
            this.intervalStatsAux(i, str);
            i++;
          }
        }
        return [];
      });
  }

  intervalStatsAux(i: number, stream: Stream) {
    stream.getWebRtcPeer().peerConnection.getStats(null)
      .then((results) => {
        this.stats[i] = this.dumpStats(results, i);
      });
  }


  dumpStats(results, i) {
    var statsArray = [];
    let bitrate;

    results.forEach((res) => {
      let date = new Date(res.timestamp);
      statsArray.push({ res: res, type: res.type, timestamp: date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() });

      let now = res.timestamp;

      if (res.type === 'inbound-rtp' && res.mediaType === 'video') {
        // firefox calculates the bitrate for us
        // https://bugzilla.mozilla.org/show_bug.cgi?id=951496
        bitrate = Math.floor(res.bitrateMean / 1024);

      } else if (res.type === 'ssrc' && res.bytesReceived && res.googFrameRateReceived) {
        // chrome does not so we need to do it ourselves
        var bytes = res.bytesReceived;
        if (this.timestampPrev[i]) {
          bitrate = 8 * (bytes - this.bytesPrev[i]) / (now - this.timestampPrev[i]);
          bitrate = Math.floor(bitrate);
        }
        this.bytesPrev[i] = bytes;
        this.timestampPrev[i] = now;
      }

    });
    if (bitrate) {
      bitrate += ' kbits/sec';
    }
    return { statsArray: statsArray, bitrate: bitrate };
  }

  getStatAttributes(stat) {
    let s = '';
    Object.keys(stat).forEach((key) => {
      if (key != 'type' && key != 'timestamp') s += (' | ' + key + ' | ');
    });
    return s;
  }
}